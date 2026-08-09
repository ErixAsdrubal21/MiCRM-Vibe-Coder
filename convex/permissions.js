import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Seguridad real (ICS-6/7/8): la identidad se deriva del servidor con
 * `getAuthUserId(ctx)` — nunca de un argumento que el cliente pueda mandar
 * ("actorId"). Toda mutation y toda query que toque datos del CRM llama a
 * una de estas tres, no lee `ctx.db` directo sin pasar por aquí.
 */

export async function requireAuthenticatedUser(ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("No autenticado.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Usuario no encontrado.");
  return user;
}

export async function requireVendedor(ctx) {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "vendedor") {
    throw new Error("Solo un vendedor puede realizar esta acción.");
  }
  return user;
}

export async function requireAdministrador(ctx) {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "administrador") {
    throw new Error("Solo un administrador puede ver esta información.");
  }
  return user;
}

export async function requireProspect(ctx, id) {
  const prospect = await ctx.db.get(id);
  if (!prospect) throw new Error("Prospecto no encontrado.");
  return prospect;
}
