import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthenticatedUser, requireVendedor, requireProspect } from "./permissions";
import { lastContactAt, pendingFollowUp, recordTimelineEvent } from "./lib";
import { channel, stage, lossReason } from "./validators.js";

/** ICS-13 Lista: todos los prospectos + lastContactAt. Sin interactions/nextFollowUp, la Lista no los usa. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const prospects = await ctx.db.query("prospects").order("desc").collect();
    return Promise.all(
      prospects.map(async (p) => ({
        ...p,
        lastContactAt: await lastContactAt(ctx, p._id, p._creationTime),
      }))
    );
  },
});

/**
 * ICS-92: solo los prospectos del vendedor autenticado (índice by_owner) +
 * lastContactAt. Lo usa el selector de "Nueva tarea" — Carlos no debe ver ni
 * agendar seguimientos sobre la cartera de otro vendedor. (La Lista general
 * `list` sigue mostrando todo; aislar esa vista es una decisión de producto
 * aparte.)
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireVendedor(ctx);
    const prospects = await ctx.db
      .query("prospects")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();
    return Promise.all(
      prospects.map(async (p) => ({
        ...p,
        lastContactAt: await lastContactAt(ctx, p._id, p._creationTime),
      }))
    );
  },
});

/**
 * ICS-81 — autocompletar de `/actividad`: hasta 10 prospectos cuyo nombre
 * contiene `query` (case-insensitive). Scan acotado de `prospects` (tabla
 * chica en el MVP). El feed recibe UN `prospectExactId` resuelto desde aquí —
 * así el feed usa un solo cursor sin merge.
 */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, { query: term }) => {
    await requireAuthenticatedUser(ctx);
    const needle = term.trim().toLowerCase();
    if (needle === "") return [];
    const prospects = await ctx.db.query("prospects").collect();
    return prospects
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, 10)
      .map((p) => ({ _id: p._id, name: p.name, stage: p.stage }));
  },
});

/** ICS-14 Pipeline: prospectos crudos, sin joins — daysInStage se calcula en el cliente desde stageChangedAt. */
export const pipeline = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    return ctx.db.query("prospects").collect();
  },
});

/**
 * ICS-12 Ficha: un prospecto + su followUp pendiente + su venta (si está Ganado).
 *
 * ICS-86: ya NO devuelve el array completo `interactions` — la ficha muestra
 * el historial vía `timeline.listByProspect` (ICS-85), paginado. Cargarlo
 * completo aquí recreaba justo el problema que ICS-81/85 resuelven para el
 * resto del CRM (un array sin límite que crece para siempre).
 */
export const get = query({
  args: { id: v.id("prospects") },
  handler: async (ctx, { id }) => {
    await requireAuthenticatedUser(ctx);
    const prospect = await ctx.db.get(id);
    if (!prospect) return null;
    const nextFollowUp = await pendingFollowUp(ctx, id);
    const sale =
      prospect.stage === "ganado"
        ? await ctx.db.query("sales").withIndex("by_prospect", (q) => q.eq("prospectId", id)).first()
        : null;
    return { ...prospect, nextFollowUp, sale };
  },
});

/** ICS-11: crea el prospecto en etapa "nuevo". ownerId se deriva del usuario autenticado, nunca se acepta del cliente. */
export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    channel,
    interest: v.string(),
    note: v.string(),
  },
  handler: async (ctx, fields) => {
    const user = await requireVendedor(ctx);
    const now = Date.now();
    const _id = await ctx.db.insert("prospects", {
      ...fields,
      stage: "nuevo",
      stageChangedAt: now,
      ownerId: user._id,
    });
    return ctx.db.get(_id);
  },
});

/** ICS-12: edición de datos de contacto. */
export const update = mutation({
  args: {
    id: v.id("prospects"),
    name: v.string(),
    phone: v.string(),
    channel,
    interest: v.string(),
    note: v.string(),
  },
  handler: async (ctx, { id, ...patch }) => {
    await requireVendedor(ctx);
    await requireProspect(ctx, id);
    await ctx.db.patch(id, patch);
    return ctx.db.get(id);
  },
});

/**
 * ICS-14/17: cambio de etapa. "perdido" exige lossReason; salir de "perdido"
 * lo limpia.
 *
 * ICS-99: `changeStage` queda como movimiento de etapa PURO — ya no acepta
 * `amount`/`product` ni toca `sales`. `prospects.stage` es el ciclo de la
 * relación, no una negociación individual (ICS-98 B2); "ganado" se mueve
 * igual que cualquier otra etapa. Registrar una venta es una acción explícita
 * aparte (`sales.createDirect` / `opportunities.win`, ICS-100/101) — ya no un
 * efecto secundario de este mutation. `sales` es histórico e inmutable: nunca
 * se crea ni se borra desde aquí.
 *
 * ICS-80 (vigente): la línea de tiempo (append-only) recibe SIEMPRE un evento
 * `cambio-etapa` con `fromStage`/`toStage`; al pasar a "ganado"/"perdido" se
 * cancela el seguimiento pendiente (`resolution: "cancelado"`, `closureReason`),
 * nunca "hecho".
 */
export const changeStage = mutation({
  args: {
    id: v.id("prospects"),
    stage,
    lossReason: v.optional(lossReason),
  },
  handler: async (ctx, { id, stage: newStage, lossReason: reason }) => {
    const user = await requireVendedor(ctx);
    const prospect = await requireProspect(ctx, id);
    const fromStage = prospect.stage;
    if (newStage === "perdido" && !reason) {
      throw new Error("Selecciona un motivo antes de marcar como perdido (ICS-17).");
    }
    const now = Date.now();
    await ctx.db.patch(id, {
      stage: newStage,
      stageChangedAt: now,
      lossReason: newStage === "perdido" ? reason : undefined,
    });

    // Cerrar (cancelar) el seguimiento pendiente al cerrar el prospecto.
    if (newStage === "ganado" || newStage === "perdido") {
      const pending = await pendingFollowUp(ctx, id);
      if (pending) {
        await ctx.db.patch(pending._id, {
          status: "completado",
          completedAt: now,
          completedBy: user._id,
          resolution: "cancelado",
          closureReason: `cierre por cambio de etapa a ${newStage}`,
        });
      }
    }

    await recordTimelineEvent(ctx, {
      prospectId: id,
      at: now,
      type: "cambio-etapa",
      actorId: user._id,
      fromStage,
      toStage: newStage,
    });

    return ctx.db.get(id);
  },
});
