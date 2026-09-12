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
  endOfBusinessTodayMs,
  recordTimelineEvent,
} from "./lib";
import { contactType, followUpType, resolution } from "./validators.js";

/**
 * ICS-19 + ICS-80: home de Carlos — los seguimientos pendientes vencidos o de
 * hoy. Se leen por el índice `by_status_and_date` (pendientes con `at` antes
 * del fin de hoy en la zona del negocio) — sin `.collect()` de `prospects`.
 *
 * Para cada uno se calcula `daysSinceContact` (última interacción no borrada)
 * y se marca `atRisk` si pasa de 3 días. COSTO ACEPTADO (ICS-80): esta query
 * ya NO cubre "prospecto activo SIN ningún seguimiento y con días sin
 * contacto" — eso exigía recorrer toda la tabla de prospectos. Ese caso lo
 * cubren la alerta de riesgo del dashboard (ICS-87) y `/actividad` (ICS-88).
 */
export const today = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const cutoff = endOfBusinessTodayMs();

    const pending = await ctx.db
      .query("followUps")
      .withIndex("by_status_and_date", (q) => q.eq("status", "pendiente").lt("at", cutoff))
      .collect();

    const rows = await Promise.all(
      pending.map(async (followUp) => {
        const prospect = await ctx.db.get(followUp.prospectId);
        if (!prospect) return null;
        const lastAt = await lastContactAt(ctx, prospect._id, prospect._creationTime);
        const daysSinceContact = daysSince(lastAt);
        return {
          prospect: { _id: prospect._id, name: prospect.name, stage: prospect.stage },
          nextFollowUp: followUp,
          daysSinceContact,
          atRisk: daysSinceContact > 3,
        };
      }),
    );

    return rows.filter(Boolean).sort((a, b) => b.daysSinceContact - a.daysSinceContact);
  },
});

const DEFAULT_CLOSURE_NOTE = {
  hecho: "Seguimiento realizado",
  "no-contactado": "No se logró contactar",
  reprogramado: "Seguimiento reprogramado",
  cancelado: "Seguimiento cancelado",
};

/**
 * ICS-80: cerrar un seguimiento explícitamente, POR ID y con una resolución.
 * Deja rastro completo:
 *  - `patch` del follow-up: `status`, `completedAt`, `completedBy`, `resolution`.
 *  - una interacción automática (`source: "follow-up"`) con la nota real del
 *    usuario o la de por defecto según la resolución; enlazada en ambos
 *    sentidos (`interaction.followUpId` / `followUp.completedByInteractionId`).
 *  - si `resolution === "reprogramado"`: un nuevo follow-up `pendiente` con
 *    `ownerId` del prospecto, enlazado en `interaction.nextFollowUpId`.
 *  - un evento `cierre-seguimiento` en la línea de tiempo (ICS-85), con el
 *    `interactionId` de la nota de cierre.
 */
export const complete = mutation({
  args: {
    id: v.id("followUps"),
    resolution,
    note: v.optional(v.string()),
    type: v.optional(contactType),
    nextFollowUp: v.optional(v.object({ at: v.number(), type: followUpType })),
  },
  handler: async (ctx, { id, resolution: res, note, type, nextFollowUp }) => {
    const user = await requireVendedor(ctx);
    const followUp = await ctx.db.get(id);
    if (!followUp) throw new Error("Seguimiento no encontrado.");
    const prospect = await requireProspect(ctx, followUp.prospectId);
    if (followUp.status !== "pendiente") throw new Error("El seguimiento ya fue cerrado.");
    if (res === "reprogramado" && !nextFollowUp) {
      throw new Error("Para reprogramar el seguimiento necesitas indicar la nueva fecha.");
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      status: "completado",
      completedAt: now,
      completedBy: user._id,
      resolution: res,
    });

    const interactionNote = note && note.trim() !== "" ? note : DEFAULT_CLOSURE_NOTE[res];
    const interactionId = await ctx.db.insert("interactions", {
      prospectId: followUp.prospectId,
      at: now,
      type: type ?? followUp.type,
      note: interactionNote,
      registeredBy: user._id,
      source: "follow-up",
      followUpId: id,
    });
    await ctx.db.patch(id, { completedByInteractionId: interactionId });

    if (res === "reprogramado") {
      const nextId = await ctx.db.insert("followUps", {
        prospectId: followUp.prospectId,
        at: nextFollowUp.at,
        type: nextFollowUp.type,
        status: "pendiente",
        ownerId: prospect.ownerId,
      });
      await ctx.db.patch(interactionId, { nextFollowUpId: nextId });
    }

    await recordTimelineEvent(ctx, {
      prospectId: followUp.prospectId,
      at: now,
      type: "cierre-seguimiento",
      actorId: user._id,
      followUpId: id,
      interactionId,
    });

    return ctx.db.get(followUp.prospectId);
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
