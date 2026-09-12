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
 * ICS-14/17/21: cambio de etapa. "perdido" exige lossReason; salir de
 * "perdido" lo limpia. "ganado" exige amount+product.
 *
 * Invariante de venta: a lo más una fila de `sales` por prospecto, y existe
 * si y solo si el prospecto está actualmente en "ganado". Entrar a "ganado"
 * hace upsert (si ya había una venta previa para este prospecto — porque se
 * salió y volvió a entrar — se actualiza en vez de duplicarla); salir de
 * "ganado" hacia cualquier otra etapa borra la venta, porque deja de ser
 * cierto que el prospecto está vendido. Sin esto, un ciclo
 * ganado → otra etapa → ganado generaba una fila de `sales` por cada vuelta,
 * inflando conteos en Ficha/Mi desempeño.
 *
 * ICS-80:
 *  - la línea de tiempo (append-only) recibe SIEMPRE un evento `cambio-etapa`
 *    con `fromStage`/`toStage`; al entrar a "ganado", además un evento `venta`.
 *    Salir de "ganado" borra la fila `sales` como antes, pero el evento `venta`
 *    histórico NO se borra — la hidratación de ICS-85 lo muestra como
 *    "venta registrada" aunque después se revirtiera.
 *  - al pasar a "ganado"/"perdido" se cancela el seguimiento pendiente
 *    (`resolution: "cancelado"`, `closureReason`), nunca "hecho".
 *
 * NOTA (ICS-80): la creación de la venta seguirá viviendo aquí hasta que el
 * milestone 7 (ICS-99) desacople `sales` de `changeStage`.
 */
export const changeStage = mutation({
  args: {
    id: v.id("prospects"),
    stage,
    lossReason: v.optional(lossReason),
    amount: v.optional(v.number()),
    product: v.optional(v.string()),
  },
  handler: async (ctx, { id, stage: newStage, lossReason: reason, amount, product }) => {
    const user = await requireVendedor(ctx);
    const prospect = await requireProspect(ctx, id);
    const fromStage = prospect.stage;
    if (newStage === "perdido" && !reason) {
      throw new Error("Selecciona un motivo antes de marcar como perdido (ICS-17).");
    }
    if (newStage === "ganado" && (!amount || amount <= 0 || !product?.trim())) {
      throw new Error("Registra el monto y el producto/servicio vendido antes de marcar como ganado (ICS-21).");
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

    const existingSale = await ctx.db.query("sales").withIndex("by_prospect", (q) => q.eq("prospectId", id)).first();
    if (newStage === "ganado") {
      const saleFields = { prospectId: id, amount, product: product.trim(), closedAt: now, closedBy: user._id };
      let saleId;
      if (existingSale) {
        await ctx.db.patch(existingSale._id, saleFields);
        saleId = existingSale._id;
      } else {
        saleId = await ctx.db.insert("sales", saleFields);
      }
      await recordTimelineEvent(ctx, { prospectId: id, at: now, type: "venta", actorId: user._id, saleId });
    } else if (existingSale) {
      await ctx.db.delete(existingSale._id);
    }
    return ctx.db.get(id);
  },
});
