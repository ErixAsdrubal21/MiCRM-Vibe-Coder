import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";

/**
 * Seguridad real (ICS-6/7/8, reemplaza el login mock): sin registro público.
 * Login solo permite iniciar sesión — las cuentas de Carlos/Marta se
 * aprovisionan con `scripts/provision-user.mjs` (ver convex/users.js:
 * provisionPassword), no con un formulario. `createOrUpdateUser` refuerza
 * esto del lado del servidor: nunca crea un usuario nuevo, solo vincula la
 * credencial a una fila de `users` que ya existe con ese email — cualquier
 * otro correo se rechaza explícitamente, incluso vía Google (que sí verifica
 * el email, pero verificar el email no es lo mismo que autorizar acceso).
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
 * ICS-7: Google se cierra con la misma regla — `createOrUpdateUser` no
 * distingue provider, así que "iniciar sesión con Google" solo funciona
 * para un correo que ya tiene fila en `users` (aprovisionada por un admin).
 * Esto se aparta a propósito del criterio de aceptación original de ICS-7
 * ("un usuario nuevo puede crear su cuenta con un clic usando Google") — ese
 * criterio es anterior a la decisión de sistema cerrado de ICS-6/8, y
 * reabrir auto-registro solo para Google dejaría la misma vía de toma de
 * cuenta que se cerró ahí (cualquiera con acceso a
 * carlos@minegocio.com en Google podría auto-crearse esa cuenta).
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
    Google,
  ],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, type, profile }) {
      if (existingUserId) return existingUserId;

      if (type === "oauth" && profile.email_verified === false) {
        throw new Error("Correo de Google no verificado.");
      }

      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", profile.email))
        .unique();
      if (existing) return existing._id;

      throw new Error("No existe una cuenta para este correo. Contacta a un administrador.");
    },
  },
});
