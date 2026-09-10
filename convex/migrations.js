import { internalMutation } from "./_generated/server";
import { recordTimelineEvent } from "./lib";

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

/**
 * ICS-85 — backfill único de `timelineEvents`. Un solo `run` después de
 * desplegar el esquema; idempotente (no duplica), así que reejecutar es
 * inofensivo:
 *   npx convex run migrations:backfillTimelineEvents
 *
 * Crea:
 *   - un evento `interaccion` por cada interacción existente NO borrada,
 *     con su `at` original y `actorId = registeredBy`.
 *   - un evento sintético `cambio-etapa` por prospecto (`toStage = stage`
 *     actual, `at = stageChangedAt`). Los cambios de etapa anteriores no son
 *     recuperables — este evento solo ancla el estado actual en la línea.
 *
 * De un solo uso: carga las tablas completas en memoria (patrón de
 * `backfillFollowUpOwner`). La escritura incremental desde las mutations
 * vive en ICS-79 / ICS-80.
 */
export const backfillTimelineEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("timelineEvents").collect();
    const haveInteractionEvent = new Set(
      existing.filter((e) => e.type === "interaccion" && e.interactionId).map((e) => e.interactionId),
    );
    const haveStageEvent = new Set(
      existing.filter((e) => e.type === "cambio-etapa").map((e) => e.prospectId),
    );

    const interactions = await ctx.db.query("interactions").collect();
    let interactionEvents = 0;
    let skippedDeleted = 0;
    let skippedExistingInteraction = 0;
    for (const interaction of interactions) {
      if (interaction.deletedAt) {
        skippedDeleted++;
        continue;
      }
      if (haveInteractionEvent.has(interaction._id)) {
        skippedExistingInteraction++;
        continue;
      }
      await recordTimelineEvent(ctx, {
        prospectId: interaction.prospectId,
        at: interaction.at,
        type: "interaccion",
        actorId: interaction.registeredBy,
        interactionId: interaction._id,
      });
      interactionEvents++;
    }

    const prospects = await ctx.db.query("prospects").collect();
    let stageEvents = 0;
    let skippedExistingStage = 0;
    for (const prospect of prospects) {
      if (haveStageEvent.has(prospect._id)) {
        skippedExistingStage++;
        continue;
      }
      await recordTimelineEvent(ctx, {
        prospectId: prospect._id,
        at: prospect.stageChangedAt,
        type: "cambio-etapa",
        toStage: prospect.stage,
      });
      stageEvents++;
    }

    return {
      interactions: interactions.length,
      interactionEvents,
      skippedDeleted,
      skippedExistingInteraction,
      prospects: prospects.length,
      stageEvents,
      skippedExistingStage,
    };
  },
});
