import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

/**
 * Seguridad real (ICS-6/7/8): la identidad se deriva del servidor con
 * `getAuthUserId(ctx)` — nunca de un argumento que el cliente pueda mandar
 * ("actorId"). Toda mutation y toda query que toque datos del CRM llama a
 * una de estas tres, no lee `ctx.db` directo sin pasar por aquí.
 */

/**
 * ICS-111 — usuario del token solo si su sesión sigue viva (y, desde ICS-117,
 * solo si la cuenta sigue activa). `getAuthUserId`
 * lee el JWT sin consultar la base, así que un token ya emitido seguiría
 * valiendo (hasta su vencimiento) aunque `invalidateSessions` haya borrado la
 * sesión al cambiar o restablecer la contraseña. Al leer `authSessions`, las
 * queries suscritas también se re-evalúan en cuanto la sesión se borra.
 */
export async function getActiveUserId(ctx) {
  const userId = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!userId || !sessionId) return null;
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId || session.expirationTime <= Date.now()) return null;
  const user = await ctx.db.get(userId);
  if (!isActiveUser(user)) return null;
  return userId;
}

/**
 * ICS-117 — una cuenta puede entrar y operar solo si existe, tiene rol y no
 * está desactivada. Única definición de "activa": la usan la sesión (aquí),
 * el login (`convex/auth.js`) y la recuperación de contraseña.
 */
export function isActiveUser(user) {
  return Boolean(user && user.role && !user.disabledAt);
}

export async function requireAuthenticatedUser(ctx) {
  const userId = await getActiveUserId(ctx);
  if (!userId) throw new ConvexError("No autenticado.");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("Usuario no encontrado.");
  return user;
}

export async function requireVendedor(ctx) {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "vendedor") {
    throw new ConvexError("Solo un vendedor puede realizar esta acción.");
  }
  return user;
}

export async function requireAdministrador(ctx) {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "administrador") {
    throw new ConvexError("Solo un administrador puede ver esta información.");
  }
  return user;
}

export async function requireProspect(ctx, id) {
  const prospect = await ctx.db.get(id);
  if (!prospect) throw new ConvexError("Prospecto no encontrado.");
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
    throw new ConvexError("No puedes operar sobre un prospecto que no es tuyo.");
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
  throw new ConvexError("No puedes ver la información de este prospecto.");
}
