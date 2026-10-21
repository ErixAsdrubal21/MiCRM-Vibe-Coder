import { internalMutation } from "./_generated/server.js"; // con .js: auth.js lo importa y scripts de Node usan auth.js

/**
 * ICS-121 — bitácora mínima de seguridad. Cada cambio sensible de acceso deja
 * un evento, escrito dentro de la MISMA transacción que el cambio: si el
 * cambio se revierte, el evento también. Nunca guarda contraseñas, códigos,
 * hashes ni tokens: solo qué pasó, quién lo hizo, a quién y cuándo.
 *
 * Tipos (ver `SECURITY_EVENT_TYPES` en convex/schema.js):
 *   user_deactivated / user_reactivated        — Equipo (ICS-117)
 *   google_allowed / google_removed            — Equipo o script (ICS-118)
 *   google_linked                              — primera vinculación de Google (ICS-119)
 *   password_changed                           — la persona cambió la suya (ICS-120)
 *   password_reset_code                        — recuperó la suya con código por correo (ICS-111)
 *   password_reset_admin                       — una administradora la restableció (ICS-120)
 *   password_reset_emergency                   — script de emergencia (resetPasswordByEmail)
 *   role_changed                               — cambio de rol en Equipo (ICS-130; details.fromRole/toRole)
 *   email_changed                              — cambio de correo de acceso (ICS-131; no guarda los correos)
 * `actorId` falta cuando lo hizo un script (`details.via = "script"`).
 * `details.googleRemoved` indica que el cambio también quitó Google.
 *
 * Se conserva 12 meses (`cleanupOldSecurityEvents`, diario en convex/crons.js).
 * La pantalla para consultarla es ICS-128.
 */
export const SECURITY_EVENT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export async function logSecurityEvent(db, { type, actorId, targetUserId, details }) {
  const doc = { type, targetUserId, at: Date.now() };
  if (actorId) doc.actorId = actorId;
  if (details) doc.details = details;
  return db.insert("securityEvents", doc);
}

/** Borra los eventos con más de 12 meses, por tandas para no exceder los límites de una mutation. */
export const cleanupOldSecurityEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SECURITY_EVENT_RETENTION_MS;
    const old = await ctx.db.query("securityEvents").withIndex("by_at", (q) => q.lt("at", cutoff)).take(500);
    for (const event of old) await ctx.db.delete(event._id);
    return { deleted: old.length };
  },
});
