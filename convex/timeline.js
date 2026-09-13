import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAuthenticatedUser } from "./permissions";

/**
 * ICS-85 — línea de tiempo de la relación para la ficha (ICS-86).
 *
 * `timelineEvents` (ICS-78) es la única fuente cronológica: paginar solo
 * `interactions` daría un orden incompleto (mezcla 4 tipos de evento). La
 * escritura de eventos vive en `recordTimelineEvent` (lib.js) y se cablea
 * desde las mutations en ICS-79 / ICS-80 — aquí solo se lee.
 *
 * Hidratación sin joins (Convex no los tiene) y sin lecturas redundantes:
 * se juntan los ids únicos de cada tabla en la página y se lee cada
 * documento UNA sola vez a un `Map`. El costo por página es O(tamaño de
 * página), no O(página × entidades).
 */

/** Lee cada id de `ids` una sola vez; devuelve un Map id → documento (sin los que no existen). */
async function byId(ctx, ids) {
  const map = new Map();
  await Promise.all(
    [...ids].map(async (id) => {
      const doc = await ctx.db.get(id);
      if (doc) map.set(id, doc);
    }),
  );
  return map;
}

const nameOf = (users, id) => (id && users.get(id)?.name) || null;

export const listByProspect = query({
  args: { prospectId: v.id("prospects"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { prospectId, paginationOpts }) => {
    await requireAuthenticatedUser(ctx);

    const result = await ctx.db
      .query("timelineEvents")
      .withIndex("by_prospect_and_at", (q) => q.eq("prospectId", prospectId))
      .order("desc")
      .paginate(paginationOpts);

    // 1ª pasada: ids directos de los eventos de la página.
    const userIds = new Set();
    const interactionIds = new Set();
    const followUpIds = new Set();
    const saleIds = new Set();
    for (const event of result.page) {
      if (event.actorId) userIds.add(event.actorId);
      if (event.interactionId) interactionIds.add(event.interactionId);
      if (event.followUpId) followUpIds.add(event.followUpId);
      if (event.saleId) saleIds.add(event.saleId);
    }

    const [interactions, followUps, sales] = await Promise.all([
      byId(ctx, interactionIds),
      byId(ctx, followUpIds),
      byId(ctx, saleIds),
    ]);

    // 2ª pasada: usuarios referidos por las entidades ya resueltas
    // (registeredBy / editedBy / completedBy) que no venían en actorId.
    for (const interaction of interactions.values()) {
      if (interaction.registeredBy) userIds.add(interaction.registeredBy);
      if (interaction.editedBy) userIds.add(interaction.editedBy);
    }
    for (const followUp of followUps.values()) {
      if (followUp.completedBy) userIds.add(followUp.completedBy);
    }
    const users = await byId(ctx, userIds);

    const page = [];
    for (const event of result.page) {
      const base = {
        _id: event._id,
        at: event.at,
        type: event.type,
        actorId: event.actorId ?? null,
        actorName: nameOf(users, event.actorId),
      };

      if (event.type === "interaccion") {
        const interaction = interactions.get(event.interactionId);
        // El evento permanece en la tabla, pero una interacción borrada
        // (o ausente) no se devuelve hidratada.
        if (!interaction || interaction.deletedAt) continue;
        page.push({
          ...base,
          interaction: {
            _id: interaction._id,
            at: interaction.at,
            note: interaction.note,
            contactType: interaction.type,
            outcome: interaction.outcome ?? null,
            source: interaction.source ?? "manual",
            editedAt: interaction.editedAt ?? null,
            registeredByName: nameOf(users, interaction.registeredBy),
          },
        });
        continue;
      }

      if (event.type === "cambio-etapa") {
        page.push({
          ...base,
          stageChange: { fromStage: event.fromStage ?? null, toStage: event.toStage ?? null },
        });
        continue;
      }

      if (event.type === "cierre-seguimiento") {
        const followUp = followUps.get(event.followUpId);
        page.push({
          ...base,
          followUpClosure: followUp
            ? {
                _id: followUp._id,
                followUpType: followUp.type,
                resolution: followUp.resolution ?? null,
                closureReason: followUp.closureReason ?? null,
                completedByName: nameOf(users, followUp.completedBy),
              }
            : null,
        });
        continue;
      }

      if (event.type === "venta") {
        const sale = sales.get(event.saleId);
        page.push({
          ...base,
          sale: sale
            ? { _id: sale._id, amount: sale.amount, product: sale.product, closedAt: sale.closedAt }
            : null,
        });
        continue;
      }

      page.push(base);
    }

    return { ...result, page };
  },
});
