import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import Google from "@auth/core/providers/google";
import { internal } from "./_generated/api";

/**
 * "Open access" — entrar con un clic, sin contraseña, elegido por rol.
 * Decisión del usuario (2026-09-21): mientras el equipo sigue desarrollando,
 * prefieren no tener que recordar contraseñas. Es un interruptor real de
 * seguridad — con `OPEN_ACCESS=true` cualquiera con la URL pública entra
 * como Carlos o Marta sin credencial alguna. Para revertir: `npx convex env
 * remove OPEN_ACCESS` (o ponerlo en cualquier valor que no sea "true") — no
 * hace falta tocar código ni volver a desplegar.
 *
 * Implementado como su propio provider (`ConvexCredentials`, la misma base
 * que usa `Password` por debajo) en vez de tocar `Password`/Google: ninguna
 * cuenta ni flujo existente cambia, y quitar esto es borrar un bloque
 * autocontenido. `authorize` mismo revisa la bandera — no depender de que
 * el cliente decida no ofrecer el botón, que solo oculta la opción, no la
 * cierra del lado del servidor.
 */
const OpenAccess = ConvexCredentials({
  id: "open-access",
  authorize: async ({ role }, ctx) => {
    if (process.env.OPEN_ACCESS !== "true") {
      throw new Error("Acceso abierto deshabilitado.");
    }
    if (role !== "vendedor" && role !== "administrador") {
      throw new Error("Rol inválido.");
    }
    const user = await ctx.runQuery(internal.users.getFirstUserByRole, { role });
    if (!user) throw new Error(`No hay ningún usuario con rol ${role}.`);
    return { userId: user._id };
  },
});

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
    OpenAccess,
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
