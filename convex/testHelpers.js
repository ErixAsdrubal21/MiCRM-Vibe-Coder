import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { recordTimelineEvent, syncPendingFollowUpOwner } from "./lib";

const SMOKE_PREFIXES = ["[SMOKE ICS-92]", "[SMOKE ICS-85]", "[SMOKE ICS-79]", "[SMOKE ICS-80]"];

/** Rechaza cualquier id cuyo prospecto no sea de prueba (o no exista). */
async function requireSmokeProspect(ctx, id) {
  const prospect = await ctx.db.get(id);
  if (!prospect) throw new Error(`Prospecto ${id} no existe.`);
  if (!SMOKE_PREFIXES.some((p) => prospect.name.startsWith(p))) {
    throw new Error(`Rechazado: "${prospect.name}" no es un prospecto de prueba.`);
  }
  return prospect;
}

/**
 * Solo para smoke tests / limpieza manual — `internalMutation`, nunca expuesta
 * a la app. Borra un prospecto y TODO lo que cuelga de él (interacciones,
 * seguimientos, ventas, eventos de línea de tiempo). Correr con el deploy key:
 *   npx convex run testHelpers:deleteProspectCascade '{"id":"<prospectId>"}'
 *
 * Guarda de seguridad: solo borra prospectos cuyo nombre empieza con el prefijo
 * de datos de prueba — un id equivocado no puede llevarse un cliente real.
 */
export const deleteProspectCascade = internalMutation({
  args: { id: v.id("prospects") },
  handler: async (ctx, { id }) => {
    const prospect = await ctx.db.get(id);
    if (prospect && !SMOKE_PREFIXES.some((p) => prospect.name.startsWith(p))) {
      throw new Error(
        `Rechazado: "${prospect.name}" no es un prospecto de prueba (prefijos válidos: ${SMOKE_PREFIXES.join(", ")}).`,
      );
    }

    const tables = /** @type {const} */ ([
      ["interactions", "by_prospect"],
      ["followUps", "by_prospect"],
      ["sales", "by_prospect"],
      ["timelineEvents", "by_prospect_and_at"],
    ]);
    let deleted = 0;
    for (const [table, index] of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex(index, (q) => q.eq("prospectId", id))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    if (prospect) {
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted };
  },
});

/**
 * ICS-85 — siembra una línea de tiempo variada para el smoke de
 * `timeline.listByProspect`. La escritura real de eventos desde las mutations
 * es ICS-79/ICS-80; hasta entonces este helper es la única forma de ejercitar
 * la hidratación de los 4 tipos + el caso "interacción borrada".
 *
 * Deja: 3 interacciones (con evento `interaccion` cada una), 1 venta (evento
 * `venta`), 1 seguimiento cerrado (evento `cierre-seguimiento`), 1 evento
 * `cambio-etapa`; y marca la 2ª interacción como borrada (su evento queda en
 * la tabla pero no debe devolverse hidratado). Solo prospectos de prueba.
 */
export const seedTimelineForSmoke = internalMutation({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const prospect = await requireSmokeProspect(ctx, prospectId);
    const actorId = prospect.ownerId;
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const interactionIds = [];
    for (let i = 3; i >= 1; i--) {
      const at = now - i * DAY;
      const interactionId = await ctx.db.insert("interactions", {
        prospectId,
        at,
        type: "llamada",
        note: `Interacción de prueba ${4 - i}`,
        registeredBy: actorId,
        source: "manual",
      });
      interactionIds.push(interactionId);
      await recordTimelineEvent(ctx, { prospectId, at, type: "interaccion", actorId, interactionId });
    }

    // 2ª interacción: borrada — su evento permanece, la hidratación la omite.
    const deletedInteractionId = interactionIds[1];
    await ctx.db.patch(deletedInteractionId, { deletedAt: now, deletedBy: actorId });

    const saleId = await ctx.db.insert("sales", {
      prospectId,
      amount: 12345,
      product: "Producto de prueba",
      closedAt: now - 12 * 60 * 60 * 1000,
      closedBy: actorId,
    });
    await recordTimelineEvent(ctx, {
      prospectId,
      at: now - 12 * 60 * 60 * 1000,
      type: "venta",
      actorId,
      saleId,
    });

    const followUpId = await ctx.db.insert("followUps", {
      prospectId,
      at: now - 6 * 60 * 60 * 1000,
      type: "llamada",
      status: "completado",
      completedAt: now - 6 * 60 * 60 * 1000,
      completedBy: actorId,
      resolution: "hecho",
      ownerId: actorId,
    });
    await recordTimelineEvent(ctx, {
      prospectId,
      at: now - 6 * 60 * 60 * 1000,
      type: "cierre-seguimiento",
      actorId,
      followUpId,
    });

    await recordTimelineEvent(ctx, {
      prospectId,
      at: now - 2 * DAY,
      type: "cambio-etapa",
      actorId,
      fromStage: "contactado",
      toStage: "cotizacion",
    });

    return {
      deletedInteractionId,
      visibleInteractionEvents: interactionIds.length - 1,
      totalEvents: interactionIds.length + 3,
    };
  },
});

/** Todas las interacciones y seguimientos de un prospecto de prueba (incluye borrados/completados). */
export const dumpProspectForSmoke = internalQuery({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const prospect = await ctx.db.get(prospectId);
    if (!prospect || !SMOKE_PREFIXES.some((p) => prospect.name.startsWith(p))) {
      throw new Error("No es un prospecto de prueba.");
    }
    const [interactions, followUps, sales, timelineEvents] = await Promise.all([
      ctx.db.query("interactions").withIndex("by_prospect", (q) => q.eq("prospectId", prospectId)).collect(),
      ctx.db.query("followUps").withIndex("by_prospect", (q) => q.eq("prospectId", prospectId)).collect(),
      ctx.db.query("sales").withIndex("by_prospect", (q) => q.eq("prospectId", prospectId)).collect(),
      ctx.db.query("timelineEvents").withIndex("by_prospect_and_at", (q) => q.eq("prospectId", prospectId)).collect(),
    ]);
    return { interactions, followUps, sales, timelineEvents };
  },
});

/**
 * ICS-80 — no existe (aún) una mutation de reasignación de cartera. Este
 * helper simula lo que esa mutation debería hacer: cambiar `prospect.ownerId`
 * y, en el mismo paso, llamar a `syncPendingFollowUpOwner` para que el
 * seguimiento pendiente siga al nuevo dueño. Solo prospectos de prueba.
 */
export const reassignProspectForSmoke = internalMutation({
  args: { prospectId: v.id("prospects"), newOwnerId: v.id("users") },
  handler: async (ctx, { prospectId, newOwnerId }) => {
    await requireSmokeProspect(ctx, prospectId);
    await ctx.db.patch(prospectId, { ownerId: newOwnerId });
    await syncPendingFollowUpOwner(ctx, prospectId, newOwnerId);
    const pending = await ctx.db
      .query("followUps")
      .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
      .filter((q) => q.eq(q.field("status"), "pendiente"))
      .first();
    return { pendingFollowUpOwnerId: pending?.ownerId ?? null };
  },
});
