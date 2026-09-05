/** Helpers compartidos entre prospects.js / interactions.js / followUps.js. */

import { ACTIVE_STAGE_VALUES } from "../shared/crmEnums.js";

export const ACTIVE_STAGES = ACTIVE_STAGE_VALUES;

export function isActiveStage(stage) {
  return ACTIVE_STAGES.includes(stage);
}

export function daysSince(ms) {
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

/** Última interacción del prospecto, o `fallback` (normalmente _creationTime) si no tiene ninguna. */
export async function lastContactAt(ctx, prospectId, fallback) {
  const last = await ctx.db
    .query("interactions")
    .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
    .order("desc")
    .first();
  return last ? last.at : fallback;
}

/** El followUp con status "pendiente" de este prospecto, si existe (a lo más uno a la vez). */
export async function pendingFollowUp(ctx, prospectId) {
  return ctx.db
    .query("followUps")
    .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
    .filter((q) => q.eq(q.field("status"), "pendiente"))
    .first();
}

/**
 * ICS-78 — invariante: mientras un follow-up esté `pendiente`, su `ownerId`
 * debe reflejar el `ownerId` actual del prospecto. Cualquier mutation que
 * cambie `prospects.ownerId` (reasignación de cartera) debe llamar a este
 * helper. Hoy no existe esa mutation (MVP monovendedor); queda listo para
 * ICS-80 / la funcionalidad de reasignación.
 */
export async function syncPendingFollowUpOwner(ctx, prospectId, ownerId) {
  const pending = await ctx.db
    .query("followUps")
    .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
    .filter((q) => q.eq(q.field("status"), "pendiente"))
    .collect();
  for (const followUp of pending) {
    if (followUp.ownerId !== ownerId) {
      await ctx.db.patch(followUp._id, { ownerId });
    }
  }
}
