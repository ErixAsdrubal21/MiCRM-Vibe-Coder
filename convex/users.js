import { internalAction, query } from "./_generated/server";
import { v } from "convex/values";
import { createAccount, getAuthUserId } from "@convex-dev/auth/server";

/**
 * ICS-6/7/8 — reemplaza loginMock. Sesión real vía Convex Auth: el cliente
 * ya no manda quién es, `getAuthUserId(ctx)` lo deriva del token de sesión.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId ? ctx.db.get(userId) : null;
  },
});

/**
 * Aprovisiona la credencial de Password para una fila de `users` que ya
 * existe (Carlos o Marta) — nunca crea un usuario. `createAccount` exige
 * contexto de action (no de mutation: internamente hace ctx.runMutation).
 * La verificación de "el email ya debe existir" no se repite aquí — la
 * hace `createOrUpdateUser` (convex/auth.js), que createAccount dispara
 * internamente; duplicarla aquí sería una segunda fuente de la misma regla.
 * Solo se llama desde `scripts/provision-user.mjs`, corrido localmente por
 * un humano con acceso al proyecto; nunca se expone como función pública ni
 * se llama desde la UI.
 */
export const provisionPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }) => {
    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email },
    });
    return "ok";
  },
});
