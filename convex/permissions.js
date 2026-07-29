/**
 * Seguridad MVP (no auth real): `actorId` viene de la sesión mock guardada en
 * el cliente (localStorage, ver src/lib/session.js). Estas funciones solo
 * validan que ese actorId corresponda a un usuario/prospecto que existe y
 * tiene el rol correcto — protegen contra bugs de UI, no contra un cliente
 * manipulado que reenvíe el _id de otro usuario. Auth real es ICS-6/7/8.
 */

export async function requireUser(ctx, actorId) {
  const user = await ctx.db.get(actorId);
  if (!user) throw new Error("Usuario no encontrado.");
  return user;
}

export async function requireVendedor(ctx, actorId) {
  const user = await requireUser(ctx, actorId);
  if (user.role !== "vendedor") {
    throw new Error("Solo un vendedor puede realizar esta acción.");
  }
  return user;
}

export async function requireProspect(ctx, id) {
  const prospect = await ctx.db.get(id);
  if (!prospect) throw new Error("Prospecto no encontrado.");
  return prospect;
}
