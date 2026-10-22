import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Scrypt } from "lucia";
import { findUsersByEmailInsensitive } from "./lib.js";
import { isActiveUser } from "./permissions.js";
import { internal } from "./_generated/api.js";
import { logSecurityEvent } from "./securityEvents.js";

/**
 * ICS-108 — acceso con Google, solo para cuentas ya aprovisionadas.
 * Google únicamente comprueba quién es la persona; quién puede entrar lo
 * decide `createOrUpdateUser` (abajo): el correo verificado de Google tiene
 * que coincidir con una fila de `users` que ya existe con rol. Nunca se crea
 * un usuario desde aquí.
 *
 * Se rechaza un correo con `email_verified` falso: sin esa verificación,
 * cualquiera podría poner en una cuenta de Google un correo ajeno y quedar
 * vinculado a la fila de `users` de esa persona.
 *
 * ICS-119 — además, Google tiene que ser la autoridad sobre ese correo:
 * - una cuenta personal de Gmail (`@gmail.com` / `@googlemail.com`, sin `hd`), o
 * - una cuenta de Google Workspace cuyo dominio (`hd`) esté en la lista
 *   `GOOGLE_ALLOWED_HD` del entorno de Convex (separada por comas; hoy
 *   `icsaab.com`).
 * Una cuenta de Google creada con un correo de otro dominio (sin `hd`) se
 * rechaza: `email_verified` solo dice que alguna vez se verificó ese buzón,
 * no que la persona lo siga controlando. Sin la variable, solo entra Gmail.
 * Se revisa en cada inicio de sesión, no solo en la primera vinculación.
 * Referencia: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 *
 * Credenciales: `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` en el entorno de
 * Convex. URI de redirección en Google Cloud:
 * `https://<deployment>.convex.site/api/auth/callback/google`.
 */
const CONSUMER_GOOGLE_DOMAINS = ["gmail.com", "googlemail.com"];

export function allowedWorkspaceDomains(raw = process.env.GOOGLE_ALLOWED_HD) {
  return (raw ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

export function googleProfileOrReject(googleProfile, allowedDomains = allowedWorkspaceDomains()) {
  if (googleProfile.email_verified !== true) {
    throw new Error("El correo de Google no está verificado.");
  }
  const email = googleProfile.email.trim().toLowerCase();
  const hd = googleProfile.hd?.trim().toLowerCase();
  const personalGmail = !hd && CONSUMER_GOOGLE_DOMAINS.includes(email.split("@")[1]);
  const authorizedWorkspace = Boolean(hd) && allowedDomains.includes(hd);
  if (!personalGmail && !authorizedWorkspace) {
    throw new Error("Esta cuenta de Google no es de Gmail ni de un dominio de empresa autorizado.");
  }
  return {
    id: googleProfile.sub,
    email,
    name: googleProfile.name,
    image: googleProfile.picture,
  };
}

// `profile` recibe (perfil, tokens): se envuelve para que los tokens no se tomen como la lista de dominios.
const GoogleProvisionedOnly = Google({ profile: (googleProfile) => googleProfileOrReject(googleProfile) });

/**
 * Seguridad real (ICS-6/7/8, reemplaza el login mock): sin registro público.
 * Login solo permite iniciar sesión — las cuentas de Carlos/Marta se
 * aprovisionan con `scripts/provision-user.mjs` (ver convex/users.js:
 * provisionPassword), no con un formulario. `createOrUpdateUser` refuerza
 * esto del lado del servidor: nunca crea un usuario nuevo, solo vincula la
 * credencial a una fila de `users` que ya existe con ese email (sin distinguir
 * mayúsculas, ver `findUsersByEmailInsensitive`) y con rol — cualquier otro
 * correo, o uno que coincida con más de una fila, se rechaza explícitamente.
 *
 * No hay registro público por ninguna vía: el proveedor de contraseña
 * (`PasswordSignInOnly`, abajo, ICS-122) solo acepta `flow: "signIn"`. Antes
 * se bloqueaba `flow: "signUp"` del `Password` de Convex Auth: sin eso,
 * cualquiera que conociera carlos@minegocio.com podía crearle una contraseña
 * antes de que él aprovisionara la suya (toma de cuenta).
 * `scripts/provision-user.mjs` usa `createAccount` directo desde una
 * `internalAction`, sin `flow`.
 *
 * El acceso abierto de un clic (provider "open-access", 2026-09-21) se quitó
 * en ICS-108: con él activo, restringir Google no protegía nada.
 */
const DISABLED_MSG = "Esta cuenta está desactivada. Contacta a un administrador.";
const NO_ACCOUNT_MSG = "No existe una cuenta para este correo. Contacta a un administrador.";
const GOOGLE_NOT_ALLOWED_MSG = "Esta cuenta no tiene permitido entrar con Google. Contacta a un administrador.";

/**
 * Decide a qué fila de `users` se vincula un inicio de sesión (o lo rechaza).
 * Es la lógica de `createOrUpdateUser`, separada para poder probarla sin un
 * login real de Google (`testHelpers:smokeResolveSignInUser`).
 *
 * - Nunca crea usuarios: solo vincula a una fila existente con ese correo.
 * - La cuenta debe estar activa (ICS-117).
 * - Con Google (`type === "oauth"`), además debe tener `googleAllowed` (ICS-118),
 *   tanto la primera vez como en cada entrada posterior. Si una administradora
 *   le quita Google, la vinculación se borra (convex/access.js `unlinkGoogle`)
 *   y un login nuevo —o uno que ya estaba a medias— cae aquí y se rechaza.
 */
export async function resolveSignInUser(db, { existingUserId, type, email }) {
  const oauth = type === "oauth";
  if (existingUserId) {
    const user = await db.get(existingUserId);
    if (!isActiveUser(user)) throw new Error(DISABLED_MSG);
    if (oauth && !user.googleAllowed) throw new Error(GOOGLE_NOT_ALLOWED_MSG);
    return existingUserId;
  }

  const matches = await findUsersByEmailInsensitive(db, email);
  if (matches.length !== 1 || !isActiveUser(matches[0])) throw new Error(NO_ACCOUNT_MSG);
  if (oauth && !matches[0].googleAllowed) throw new Error(GOOGLE_NOT_ALLOWED_MSG);
  return matches[0]._id;
}

/**
 * ICS-122 — proveedor de contraseña propio. Reemplaza al `Password` de Convex
 * Auth con el mismo identificador ("password"), el mismo hash (Scrypt de
 * `lucia`) y las mismas cuentas, así que las contraseñas actuales siguen
 * sirviendo. Diferencias:
 *
 * - Solo inicia sesión (`flow: "signIn"`). No existen `signUp`, `reset` ni
 *   `email-verification`: el registro está cerrado (las cuentas se crean con
 *   `inviteUser` / `provisionPassword`, que usan `createAccount` con
 *   `crypto.hashSecret` de aquí) y la recuperación es propia
 *   (convex/passwordReset.js).
 * - El correo se normaliza (sin espacios, en minúsculas): `Carlos@…` y
 *   `carlos@…` son la misma cuenta. Las credenciales guardan el correo en
 *   minúsculas (`migrations:normalizePasswordAccountIds`).
 * - Correo inexistente: se verifica igual contra un hash ficticio del mismo
 *   algoritmo y costo, para que la respuesta tarde lo mismo que con una
 *   contraseña equivocada y no revele qué correos tienen cuenta.
 * - Mismo límite de intentos que antes: `retrieveAccount` de Convex Auth
 *   cuenta los fallos por cuenta (`authRateLimits`, 10 por hora). La
 *   recuperación por código y el restablecimiento de la administradora lo
 *   limpian (convex/access.js `resetFailedPasswordAttempts`).
 * - Cualquier fallo responde igual ("Invalid credentials"). Una cuenta
 *   desactivada no llega a tener sesión (`beforeSessionCreation`, abajo).
 */
const scrypt = new Scrypt();
// Hash ficticio (de un valor aleatorio descartado), generado con los mismos parámetros que las contraseñas reales.
const DUMMY_PASSWORD_HASH =
  "9ca076b9be9b3def659155e8019f2b10:50832499715f8825cf751f63dc93c4fbf51ccd8cd975fa2855a6882e8ca4d72f4d55f37ebffc58af3824a9189314c7c9a215a475c921f533324c6493ca012755";

export const normalizeLoginEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");

const PasswordSignInOnly = ConvexCredentials({
  id: "password",
  crypto: {
    hashSecret: (secret) => scrypt.hash(secret),
    verifySecret: (secret, hash) => scrypt.verify(hash, secret),
  },
  authorize: async (params, ctx) => {
    if (params.flow !== "signIn") throw new Error("Solo se permite iniciar sesión.");
    const email = normalizeLoginEmail(params.email);
    const password = typeof params.password === "string" ? params.password : "";
    if (!email || !password) throw new Error("Invalid credentials");
    try {
      const { user } = await retrieveAccount(ctx, { provider: "password", account: { id: email, secret: password } });
      return { userId: user._id };
    } catch (err) {
      // Sin cuenta, retrieveAccount responde sin calcular Scrypt; se calcula aquí para igualar el tiempo.
      if (err?.message === "InvalidAccountId") await scrypt.verify(DUMMY_PASSWORD_HASH, password);
      throw new Error("Invalid credentials");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordSignInOnly, GoogleProvisionedOnly],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, type, profile }) {
      const userId = await resolveSignInUser(ctx.db, { existingUserId, type, email: profile.email });
      // ICS-119: vinculación nueva de Google → aviso por correo. Se agenda en la
      // misma transacción: si el login no termina, no se envía.
      if (type === "oauth" && !existingUserId) {
        await ctx.scheduler.runAfter(0, internal.users.sendGoogleLinkedNotice, { userId });
        await logSecurityEvent(ctx.db, { type: "google_linked", actorId: userId, targetUserId: userId });
      }
      return userId;
    },
    // ICS-117 — el login con contraseña no pasa por `createOrUpdateUser`; este
    // callback corre antes de crear CUALQUIER sesión, sea cual sea el proveedor.
    async beforeSessionCreation(ctx, { userId }) {
      if (!isActiveUser(await ctx.db.get(userId))) throw new Error(DISABLED_MSG);
    },
  },
});
