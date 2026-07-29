import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireVendedor, requireProspect } from "./permissions";
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
  handler: async (ctx) => ctx.db.query("prospects").collect(),
});

/** ICS-12 Ficha: un prospecto + sus interactions + su followUp pendiente. */
export const get = query({
  args: { id: v.id("prospects") },
  handler: async (ctx, { id }) => {
    const prospect = await ctx.db.get(id);
    if (!prospect) return null;
    const interactions = await ctx.db
      .query("interactions")
      .withIndex("by_prospect", (q) => q.eq("prospectId", id))
      .collect();
    const nextFollowUp = await pendingFollowUp(ctx, id);
    return { ...prospect, interactions, nextFollowUp };
  },
});

/** ICS-11: crea el prospecto en etapa "nuevo". ownerId se deriva de actorId, nunca se acepta del cliente. */
export const create = mutation({
  args: {
    actorId: v.id("users"),
    name: v.string(),
    phone: v.string(),
    channel,
    interest: v.string(),
    note: v.string(),
  },
  handler: async (ctx, { actorId, ...fields }) => {
    await requireVendedor(ctx, actorId);
    const now = Date.now();
    const _id = await ctx.db.insert("prospects", {
      ...fields,
      stage: "nuevo",
      stageChangedAt: now,
      ownerId: actorId,
    });
    return ctx.db.get(_id);
  },
});

/** ICS-12: edición de datos de contacto. */
export const update = mutation({
  args: {
    actorId: v.id("users"),
    id: v.id("prospects"),
    name: v.string(),
    phone: v.string(),
    channel,
    interest: v.string(),
    note: v.string(),
  },
  handler: async (ctx, { actorId, id, ...patch }) => {
    await requireVendedor(ctx, actorId);
    await requireProspect(ctx, id);
    await ctx.db.patch(id, patch);
    return ctx.db.get(id);
  },
});

/** ICS-14/17: cambio de etapa. "perdido" exige lossReason; salir de "perdido" lo limpia. */
export const changeStage = mutation({
  args: {
    actorId: v.id("users"),
    id: v.id("prospects"),
    stage,
    lossReason: v.optional(lossReason),
  },
  handler: async (ctx, { actorId, id, stage: newStage, lossReason: reason }) => {
    await requireVendedor(ctx, actorId);
    await requireProspect(ctx, id);
    if (newStage === "perdido" && !reason) {
      throw new Error("Selecciona un motivo antes de marcar como perdido (ICS-17).");
    }
    await ctx.db.patch(id, {
      stage: newStage,
      stageChangedAt: Date.now(),
      lossReason: newStage === "perdido" ? reason : undefined,
    });
    return ctx.db.get(id);
  },
});
