import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthenticatedUser, requireVendedor, requireProspect } from "./permissions";
import {
  isActiveStage,
  lastContactAt,
  pendingFollowUp,
  daysSince,
  businessToday,
  calendarDateToMs,
  isValidCalendarDate,
} from "./lib";
import { followUpType } from "./validators.js";

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

/**
 * ICS-92: agenda un seguimiento "en frío", sin haber registrado todavía una
 * interacción — punto de entrada nuevo desde "Nueva tarea" en /tareas.
 * Distinto de interactions.add: no hay nota ni contacto ya ocurrido, solo se
 * programa a futuro. Mantiene la misma invariante de "a lo más un pendiente
 * por prospecto" que interactions.add, pero aquí se RECHAZA si ya existe uno
 * en vez de reemplazarlo en silencio — quien agenda desde cero no tiene el
 * contexto de la ficha para saber que estaría pisando un pendiente existente.
 */
export const create = mutation({
  args: {
    prospectId: v.id("prospects"),
    // Fecha calendario "YYYY-MM-DD", no un timestamp — un seguimiento se agenda
    // para un DÍA, y el servidor (no el navegador) es dueño de qué día es "hoy"
    // en la zona del negocio. Ver businessToday / calendarDateToMs en lib.js.
    date: v.string(),
    type: followUpType,
  },
  handler: async (ctx, { prospectId, date, type }) => {
    const user = await requireVendedor(ctx);
    const prospect = await requireProspect(ctx, prospectId);

    if (prospect.ownerId !== user._id) {
      throw new Error("No puedes programar seguimientos para un prospecto de otro vendedor.");
    }
    if (!isValidCalendarDate(date)) {
      throw new Error("Fecha inválida.");
    }
    if (date < businessToday()) {
      throw new Error("No se puede agendar un seguimiento en el pasado.");
    }
    if (!isActiveStage(prospect.stage)) {
      throw new Error("Este prospecto ya está cerrado (ganado/perdido) — no aplica un nuevo seguimiento.");
    }
    const existing = await pendingFollowUp(ctx, prospectId);
    if (existing) {
      throw new Error(`${prospect.name} ya tiene un seguimiento pendiente. Ábrelo desde su ficha para reprogramarlo.`);
    }

    await ctx.db.insert("followUps", {
      prospectId,
      at: calendarDateToMs(date),
      type,
      status: "pendiente",
      ownerId: prospect.ownerId,
    });

    return ctx.db.get(prospectId);
  },
});
