import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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

/**
 * ICS-99 — migración de datos legacy a `opportunities` (ICS-98 B9): paginada
 * y reanudable (procesa `prospects` por lotes de 50 vía `.paginate()`, nunca
 * `.collect()` de la tabla completa) e idempotente por fila (consulta
 * `by_migration_key` antes de insertar, así que correrla dos veces — o
 * reanudarla tras un corte — deja el mismo resultado sin duplicados).
 *
 * Por cada prospecto:
 *   - `stage === "ganado"` con una fila en `sales` → 1 `opportunity` "ganada"
 *     (`migrationKey: "legacy-sale:<saleId>"`), enlazada `saleId`↔`opportunityId`;
 *     backfill de `sales.ownerId` si faltaba.
 *   - `stage` en `cotizacion`/`negociacion` sin venta → 1 `opportunity`
 *     abierta en esa etapa (`migrationKey: "legacy-prospect:<prospectId>"`),
 *     `estimatedAmount` AUSENTE ("monto pendiente" — ICS-98 B1).
 *   - cualquier otra etapa → nada (no se inventan datos).
 *
 * Un "ganado" sin fila de `sales` es inconsistencia de datos previa a ICS-99;
 * se cuenta en `skippedGanadoSinVenta` y no genera nada (nada que migrar).
 *
 * Se auto-encadena por lotes vía `ctx.scheduler` hasta terminar — un solo
 * arranque manual:
 *   npx convex run migrations:migrateOpportunitiesAndSales '{}'
 * Si el proceso se corta a medias, ya se agendó el siguiente lote (el
 * scheduler de Convex es durable) — y si no, volver a correr el mismo
 * comando es seguro por la idempotencia de `migrationKey`.
 */
export const migrateOpportunitiesAndSales = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("prospects").paginate({ numItems: 50, cursor: cursor ?? null });

    let opportunitiesCreated = 0;
    let skippedExisting = 0;
    let skippedGanadoSinVenta = 0;
    let salesOwnerBackfilled = 0;

    for (const prospect of page.page) {
      if (prospect.stage === "ganado") {
        const sale = await ctx.db
          .query("sales")
          .withIndex("by_prospect", (q) => q.eq("prospectId", prospect._id))
          .first();
        if (!sale) {
          skippedGanadoSinVenta++;
          continue;
        }
        const migrationKey = `legacy-sale:${sale._id}`;
        const already = await ctx.db
          .query("opportunities")
          .withIndex("by_migration_key", (q) => q.eq("migrationKey", migrationKey))
          .first();
        if (already) {
          skippedExisting++;
        } else {
          const opportunityId = await ctx.db.insert("opportunities", {
            prospectId: prospect._id,
            ownerId: prospect.ownerId,
            name: sale.product,
            product: sale.product,
            stage: "ganada",
            closedAt: sale.closedAt,
            closedBy: sale.closedBy,
            saleId: sale._id,
            source: "migration",
            migrationKey,
          });
          await ctx.db.patch(sale._id, { opportunityId });
          opportunitiesCreated++;
        }
        if (!sale.ownerId) {
          await ctx.db.patch(sale._id, { ownerId: prospect.ownerId });
          salesOwnerBackfilled++;
        }
      } else if (prospect.stage === "cotizacion" || prospect.stage === "negociacion") {
        const migrationKey = `legacy-prospect:${prospect._id}`;
        const already = await ctx.db
          .query("opportunities")
          .withIndex("by_migration_key", (q) => q.eq("migrationKey", migrationKey))
          .first();
        if (already) {
          skippedExisting++;
        } else {
          await ctx.db.insert("opportunities", {
            prospectId: prospect._id,
            ownerId: prospect.ownerId,
            name: prospect.interest?.trim() || "Oportunidad heredada",
            product: prospect.interest?.trim() || "",
            stage: prospect.stage,
            source: "migration",
            migrationKey,
            // estimatedAmount ausente a propósito — "monto pendiente" (B1).
          });
          opportunitiesCreated++;
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.migrateOpportunitiesAndSales, {
        cursor: page.continueCursor,
      });
    }

    return {
      processed: page.page.length,
      opportunitiesCreated,
      skippedExisting,
      skippedGanadoSinVenta,
      salesOwnerBackfilled,
      isDone: page.isDone,
      scheduledNextBatch: !page.isDone,
    };
  },
});
