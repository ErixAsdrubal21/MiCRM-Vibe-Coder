import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAuthenticatedUser } from "./permissions";
import { hydrateByIds } from "./pagination";

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
    const opportunityIds = new Set();
    for (const event of result.page) {
      if (event.actorId) userIds.add(event.actorId);
      if (event.interactionId) interactionIds.add(event.interactionId);
      if (event.followUpId) followUpIds.add(event.followUpId);
      if (event.saleId) saleIds.add(event.saleId);
      if (event.opportunityId) opportunityIds.add(event.opportunityId);
    }

    const [interactions, followUps, sales, opportunities] = await Promise.all([
      hydrateByIds(ctx, interactionIds),
      hydrateByIds(ctx, followUpIds),
      hydrateByIds(ctx, saleIds),
      hydrateByIds(ctx, opportunityIds),
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
    const users = await hydrateByIds(ctx, userIds);

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
        const closureInteraction = event.interactionId ? interactions.get(event.interactionId) : null;
        page.push({
          ...base,
          followUpClosure: followUp
            ? {
                _id: followUp._id,
                followUpType: followUp.type,
                resolution: followUp.resolution ?? null,
                closureReason: followUp.closureReason ?? null,
                completedByName: nameOf(users, followUp.completedBy),
                // Nota real que el vendedor escribió al cerrar (o la de por
                // defecto). No se muestra si la interacción quedó borrada.
                note: closureInteraction && !closureInteraction.deletedAt ? closureInteraction.note : null,
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

      // ICS-106 — 3 tipos nuevos de ICS-99/101: oportunidad-ganada,
      // oportunidad-perdida, venta-anulada. El evento `venta` original de
      // arriba NO se toca cuando la venta se anula después (append-only: la
      // anulación es un evento aparte, más adelante en el tiempo).
      if (event.type === "oportunidad-ganada" || event.type === "oportunidad-perdida") {
        const opportunity = opportunities.get(event.opportunityId);
        page.push({
          ...base,
          opportunity: opportunity
            ? { _id: opportunity._id, name: opportunity.name, product: opportunity.product, lossReason: opportunity.lossReason ?? null }
            : null,
        });
        continue;
      }

      if (event.type === "venta-anulada") {
        const sale = sales.get(event.saleId);
        page.push({
          ...base,
          voidedSale: sale
            ? { _id: sale._id, amount: sale.amount, product: sale.product, voidReason: sale.voidReason ?? null }
            : null,
        });
        continue;
      }

      page.push(base);
    }

    return { ...result, page };
  },
});
