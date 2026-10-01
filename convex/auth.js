import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { findUsersByEmailInsensitive } from "./lib.js";

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
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      if (existingUserId) return existingUserId;

      const matches = await findUsersByEmailInsensitive(ctx.db, profile.email);
      if (matches.length === 1 && matches[0].role) return matches[0]._id;

      throw new Error("No existe una cuenta para este correo. Contacta a un administrador.");
    },
  },
});
