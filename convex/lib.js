/** Helpers compartidos entre prospects.js / interactions.js / followUps.js. */

export const ACTIVE_STAGES = ["nuevo", "contactado", "cotizacion", "negociacion"];

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
