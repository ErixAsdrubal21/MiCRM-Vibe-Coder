import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

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
