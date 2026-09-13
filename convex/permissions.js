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

/**
 * ICS-99/100 — aislamiento de cartera para MUTATIONS: rol vendedor + dueño
 * del prospecto. Distinto de `requireProspectRead` (admite lectura de admin).
 * Reutilizable por ICS-94 cuando generalice el aislamiento al resto del CRM.
 */
export async function requireOwnedProspect(ctx, prospectId) {
  const user = await requireVendedor(ctx);
  const prospect = await requireProspect(ctx, prospectId);
  if (prospect.ownerId !== user._id) {
    throw new Error("No puedes operar sobre un prospecto que no es tuyo.");
  }
  return { user, prospect };
}

/**
 * ICS-99/100 (B8) — aislamiento de cartera para QUERIES individuales
 * (`opportunities.listByProspect`, `sales.listByProspect`, `sales.getById`):
 * administrador lee cualquier prospecto; vendedor solo el suyo; cualquier
 * otro caso lo rechaza el servidor.
 */
export async function requireProspectRead(ctx, prospectId) {
  const user = await requireAuthenticatedUser(ctx);
  const prospect = await requireProspect(ctx, prospectId);
  if (user.role === "administrador") return { user, prospect };
  if (user.role === "vendedor" && prospect.ownerId === user._id) return { user, prospect };
  throw new Error("No puedes ver la información de este prospecto.");
}
