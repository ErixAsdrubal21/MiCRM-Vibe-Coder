import { internalMutation } from "./_generated/server";

/**
 * ICS-78 — backfill único: `followUps.ownerId = prospect.ownerId` para los
 * follow-ups creados antes de que el campo existiera. Idempotente (salta los
 * que ya tienen `ownerId`), así que correrla más de una vez es inofensivo.
 *
 * Correr una vez, después de desplegar el esquema:
 *   npx convex run migrations:backfillFollowUpOwner
 */
export const backfillFollowUpOwner = internalMutation({
  args: {},
  handler: async (ctx) => {
    const followUps = await ctx.db.query("followUps").collect();
    let patched = 0;
    let skippedNoProspect = 0;
    for (const followUp of followUps) {
      if (followUp.ownerId) continue;
      const prospect = await ctx.db.get(followUp.prospectId);
      if (!prospect) {
        skippedNoProspect++;
        continue;
      }
      await ctx.db.patch(followUp._id, { ownerId: prospect.ownerId });
      patched++;
    }
    return { total: followUps.length, patched, skippedNoProspect };
  },
});
