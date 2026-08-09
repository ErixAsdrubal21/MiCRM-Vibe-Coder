import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthenticatedUser, requireVendedor, requireProspect } from "./permissions";
import { isActiveStage, lastContactAt, pendingFollowUp, daysSince } from "./lib";

function isDueTodayOrOverdue(followUp) {
  if (!followUp) return false;
  const target = new Date(followUp.at);
  const today = new Date();
  return target.toDateString() === today.toDateString() || target < today;
}

/**
 * ICS-19: home de Carlos. Intencionalmente más amplio que "solo followUps
 * pendientes vencidos o de hoy" — también debe mostrar prospectos activos
 * SIN ningún seguimiento programado pero con más de 3 días sin contacto
 * ("prospectos en riesgo"), igual que el comportamiento ya validado en
 * mi-crm. Por eso primero se filtra a etapas activas (conjunto reducido) y
 * solo ahí se calcula el resto — el costo cae en los prospectos activos, no
 * en todo el CRM.
 */
export const today = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const prospects = await ctx.db.query("prospects").collect();
    const active = prospects.filter((p) => isActiveStage(p.stage));

    const enriched = await Promise.all(
      active.map(async (p) => {
        const followUp = await pendingFollowUp(ctx, p._id);
        const lastAt = await lastContactAt(ctx, p._id, p._creationTime);
        return { prospect: p, followUp, daysSinceContact: daysSince(lastAt) };
      })
    );

    return enriched
      .filter(({ followUp, daysSinceContact }) => isDueTodayOrOverdue(followUp) || daysSinceContact > 3)
      .map(({ prospect, followUp, daysSinceContact }) => ({
        prospect: { _id: prospect._id, name: prospect.name, stage: prospect.stage },
        nextFollowUp: followUp,
        daysSinceContact,
        atRisk: daysSinceContact > 3,
      }))
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact);
  },
});

/** ICS-19: completar tarea = registrar interacción automática + liberar el seguimiento pendiente. */
export const complete = mutation({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const user = await requireVendedor(ctx);
    await requireProspect(ctx, prospectId);

    const followUp = await pendingFollowUp(ctx, prospectId);
    if (!followUp) {
      throw new Error("No hay ningún seguimiento pendiente para este prospecto.");
    }

    await ctx.db.patch(followUp._id, { status: "completado" });
    await ctx.db.insert("interactions", {
      prospectId,
      at: Date.now(),
      type: followUp.type,
      note: "Marcado como completado desde Tareas del día.",
      registeredBy: user._id,
    });

    return ctx.db.get(prospectId);
  },
});
