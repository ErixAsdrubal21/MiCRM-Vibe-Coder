import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { findUsersByEmailInsensitive } from "./lib.js";
import { isActiveUser } from "./permissions.js";

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
 * Credenciales: `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` en el entorno de
 * Convex. URI de redirección en Google Cloud:
 * `https://<deployment>.convex.site/api/auth/callback/google`.
 */
export function googleProfileOrReject(googleProfile) {
  if (googleProfile.email_verified !== true) {
    throw new Error("El correo de Google no está verificado.");
  }
  return {
    id: googleProfile.sub,
    email: googleProfile.email.trim().toLowerCase(),
    name: googleProfile.name,
    image: googleProfile.picture,
  };
}

const GoogleProvisionedOnly = Google({ profile: googleProfileOrReject });

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
 * El `profile` de abajo bloquea `flow: "signUp"` del lado del servidor. Sin
 * esto, `createOrUpdateUser` (arriba) vincularía cualquier signUp público a
 * la fila de `users` existente por email — alguien que solo conociera
 * carlos@minegocio.com podría llamar la action pública con `flow: "signUp"`
 * y crearle una contraseña a Carlos antes de que él aprovisione la suya
 * (toma de cuenta). `scripts/provision-user.mjs` no pasa por este flujo:
 * usa `createAccount` directo desde una `internalAction`, que no tiene
 * `flow` en absoluto.
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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (params.flow === "signUp") {
          throw new Error("Registro público deshabilitado. Contacta a un administrador.");
        }
        return { email: params.email };
      },
    }),
    GoogleProvisionedOnly,
  ],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, type, profile }) {
      return resolveSignInUser(ctx.db, { existingUserId, type, email: profile.email });
    },
    // ICS-117 — el login con contraseña no pasa por `createOrUpdateUser`; este
    // callback corre antes de crear CUALQUIER sesión, sea cual sea el proveedor.
    async beforeSessionCreation(ctx, { userId }) {
      if (!isActiveUser(await ctx.db.get(userId))) throw new Error(DISABLED_MSG);
    },
  },
});
