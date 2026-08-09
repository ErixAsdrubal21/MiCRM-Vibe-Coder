import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthenticatedUser, requireVendedor, requireProspect } from "./permissions";
import { lastContactAt, pendingFollowUp } from "./lib";

const channel = v.union(
  v.literal("whatsapp"),
  v.literal("referido"),
  v.literal("redes"),
  v.literal("visita"),
  v.literal("otro")
);

const stage = v.union(
  v.literal("nuevo"),
  v.literal("contactado"),
  v.literal("cotizacion"),
  v.literal("negociacion"),
  v.literal("ganado"),
  v.literal("perdido")
);

const lossReason = v.union(
  v.literal("precio"),
  v.literal("competencia"),
  v.literal("sin-respuesta"),
  v.literal("tiempo"),
  v.literal("otro")
);

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

/** ICS-14 Pipeline: prospectos crudos, sin joins — daysInStage se calcula en el cliente desde stageChangedAt. */
export const pipeline = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    return ctx.db.query("prospects").collect();
  },
});

/** ICS-12 Ficha: un prospecto + sus interactions + su followUp pendiente + su venta (si está Ganado). */
export const get = query({
  args: { id: v.id("prospects") },
  handler: async (ctx, { id }) => {
    await requireAuthenticatedUser(ctx);
    const prospect = await ctx.db.get(id);
    if (!prospect) return null;
    const interactions = await ctx.db
      .query("interactions")
      .withIndex("by_prospect", (q) => q.eq("prospectId", id))
      .collect();
    const nextFollowUp = await pendingFollowUp(ctx, id);
    const sale =
      prospect.stage === "ganado"
        ? await ctx.db.query("sales").withIndex("by_prospect", (q) => q.eq("prospectId", id)).first()
        : null;
    return { ...prospect, interactions, nextFollowUp, sale };
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
    await requireProspect(ctx, id);
    if (newStage === "perdido" && !reason) {
      throw new Error("Selecciona un motivo antes de marcar como perdido (ICS-17).");
    }
    if (newStage === "ganado" && (!amount || amount <= 0 || !product?.trim())) {
      throw new Error("Registra el monto y el producto/servicio vendido antes de marcar como ganado (ICS-21).");
    }
    await ctx.db.patch(id, {
      stage: newStage,
      stageChangedAt: Date.now(),
      lossReason: newStage === "perdido" ? reason : undefined,
    });

    const existingSale = await ctx.db.query("sales").withIndex("by_prospect", (q) => q.eq("prospectId", id)).first();
    if (newStage === "ganado") {
      const saleFields = { prospectId: id, amount, product: product.trim(), closedAt: Date.now(), closedBy: user._id };
      if (existingSale) {
        await ctx.db.patch(existingSale._id, saleFields);
      } else {
        await ctx.db.insert("sales", saleFields);
      }
    } else if (existingSale) {
      await ctx.db.delete(existingSale._id);
    }
    return ctx.db.get(id);
  },
});
