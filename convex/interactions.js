import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireVendedor, requireProspect } from "./permissions";
import { isActiveStage, pendingFollowUp } from "./lib";

const contactType = v.union(
  v.literal("llamada"),
  v.literal("whatsapp"),
  v.literal("visita"),
  v.literal("email")
);

const followUpType = v.union(
  v.literal("llamada"),
  v.literal("whatsapp"),
  v.literal("visita"),
  v.literal("otro")
);

/**
 * ICS-15/16: registra una interacción y programa (opcionalmente) el próximo
 * seguimiento en el mismo paso. Si el prospecto sigue en etapa activa,
 * nextFollowUp es obligatorio — no aplica a prospects.create, un prospecto
 * recién creado no tiene interacciones todavía.
 *
 * Máximo un followUp pendiente por prospecto: el anterior (si existe) se
 * marca "completado" antes de insertar el nuevo, en vez de borrarse — el
 * schema no tiene un status "reemplazado" y agregarlo es scope innecesario
 * para el MVP.
 */
export const add = mutation({
  args: {
    prospectId: v.id("prospects"),
    type: contactType,
    note: v.string(),
    nextFollowUp: v.optional(v.object({ at: v.number(), type: followUpType })),
  },
  handler: async (ctx, { prospectId, type, note, nextFollowUp }) => {
    const user = await requireVendedor(ctx);
    const prospect = await requireProspect(ctx, prospectId);

    if (isActiveStage(prospect.stage) && !nextFollowUp) {
      throw new Error("Todo prospecto activo necesita una fecha de próximo seguimiento (ICS-16).");
    }

    await ctx.db.insert("interactions", {
      prospectId,
      at: Date.now(),
      type,
      note,
      registeredBy: user._id,
    });

    const existing = await pendingFollowUp(ctx, prospectId);
    if (existing) {
      await ctx.db.patch(existing._id, { status: "completado" });
    }
    if (nextFollowUp) {
      await ctx.db.insert("followUps", {
        prospectId,
        at: nextFollowUp.at,
        type: nextFollowUp.type,
        status: "pendiente",
      });
    }

    return ctx.db.get(prospectId);
  },
});
