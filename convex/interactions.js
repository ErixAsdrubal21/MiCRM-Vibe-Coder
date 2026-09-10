import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireVendedor, requireProspect } from "./permissions";
import { isActiveStage, pendingFollowUp, recordTimelineEvent } from "./lib";
import { contactType, followUpType, outcome } from "./validators.js";

/**
 * ICS-15/16 + ICS-79: registra una interacción y programa (opcionalmente) el
 * próximo seguimiento en el mismo paso. Si el prospecto sigue en etapa activa,
 * `nextFollowUp` es obligatorio (ICS-16).
 *
 * ICS-79 robustece:
 *  - `note` obligatoria y no vacía tras `trim()`.
 *  - `at?` para interacciones retroactivas, con ventana [hace 1 año, +5 min].
 *  - `outcome?` opcional.
 *  - `source: "manual"` siempre.
 *  - el follow-up siguiente hereda `ownerId` del prospecto y su id se guarda
 *    en `interaction.nextFollowUpId`.
 *  - se registra el evento `interaccion` en la línea de tiempo (ICS-85).
 *
 * El cierre del follow-up pendiente al registrar una interacción se mantiene
 * como estaba (patch a "completado"); volverlo explícito con `resolution` es
 * ICS-80.
 */

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_BACKDATE_MS = 365 * 24 * 60 * 60 * 1000;

/** Nota no vacía tras trim, o error. Devuelve la nota tal cual la mandó el usuario. */
function requireNote(note) {
  if (typeof note !== "string" || note.trim() === "") {
    throw new Error("La nota de la interacción no puede estar vacía.");
  }
  return note;
}

/** `at` dentro de la ventana permitida, o error. Devuelve el `at` a usar (o `Date.now()` si no vino). */
function resolveAt(at) {
  if (at === undefined) return Date.now();
  const now = Date.now();
  if (at > now + FUTURE_TOLERANCE_MS) {
    throw new Error("La fecha no puede ser futura.");
  }
  if (at < now - MAX_BACKDATE_MS) {
    throw new Error("La fecha es demasiado antigua (máx. 1 año).");
  }
  return at;
}

export const add = mutation({
  args: {
    prospectId: v.id("prospects"),
    type: contactType,
    note: v.string(),
    at: v.optional(v.number()),
    outcome: v.optional(outcome),
    nextFollowUp: v.optional(v.object({ at: v.number(), type: followUpType })),
  },
  handler: async (ctx, { prospectId, type, note, at, outcome: outcomeArg, nextFollowUp }) => {
    const user = await requireVendedor(ctx);
    const prospect = await requireProspect(ctx, prospectId);

    requireNote(note);
    const interactionAt = resolveAt(at);

    if (isActiveStage(prospect.stage) && !nextFollowUp) {
      throw new Error("Todo prospecto activo necesita una fecha de próximo seguimiento (ICS-16).");
    }

    const interactionId = await ctx.db.insert("interactions", {
      prospectId,
      at: interactionAt,
      type,
      note,
      registeredBy: user._id,
      source: "manual",
      outcome: outcomeArg,
    });

    await recordTimelineEvent(ctx, {
      prospectId,
      at: interactionAt,
      type: "interaccion",
      actorId: user._id,
      interactionId,
    });

    const existing = await pendingFollowUp(ctx, prospectId);
    if (existing) {
      await ctx.db.patch(existing._id, { status: "completado" });
    }
    if (nextFollowUp) {
      const followUpId = await ctx.db.insert("followUps", {
        prospectId,
        at: nextFollowUp.at,
        type: nextFollowUp.type,
        status: "pendiente",
        ownerId: prospect.ownerId,
      });
      await ctx.db.patch(interactionId, { nextFollowUpId: followUpId });
    }

    return ctx.db.get(prospectId);
  },
});

/**
 * ICS-79: el autor corrige su interacción. Deja `editedAt`/`editedBy`. Si cambia
 * el `at`, re-data el evento del timeline con ese `interactionId` — excepción
 * acotada a "append-only" (no se crean ni borran eventos, solo se mueve uno en
 * el eje temporal para no romper el orden cronológico).
 */
export const edit = mutation({
  args: {
    id: v.id("interactions"),
    note: v.optional(v.string()),
    type: v.optional(contactType),
    outcome: v.optional(outcome),
    at: v.optional(v.number()),
  },
  handler: async (ctx, { id, note, type, outcome: outcomeArg, at }) => {
    const user = await requireVendedor(ctx);
    const interaction = await ctx.db.get(id);
    if (!interaction) throw new Error("Interacción no encontrada.");
    if (interaction.registeredBy !== user._id) {
      throw new Error("Solo puedes editar interacciones que tú registraste.");
    }
    if (interaction.deletedAt) {
      throw new Error("La interacción ya fue eliminada.");
    }

    const patch = { editedAt: Date.now(), editedBy: user._id };
    if (note !== undefined) patch.note = requireNote(note);
    if (type !== undefined) patch.type = type;
    if (outcomeArg !== undefined) patch.outcome = outcomeArg;
    if (at !== undefined) patch.at = resolveAt(at);

    await ctx.db.patch(id, patch);

    if (patch.at !== undefined && patch.at !== interaction.at) {
      const event = await ctx.db
        .query("timelineEvents")
        .withIndex("by_prospect_and_at", (q) => q.eq("prospectId", interaction.prospectId))
        .filter((q) => q.eq(q.field("interactionId"), id))
        .first();
      if (event) await ctx.db.patch(event._id, { at: patch.at });
    }

    return ctx.db.get(id);
  },
});

/**
 * ICS-79: borrado suave. Nunca `ctx.db.delete`. No revierte el follow-up que
 * hubiera cerrado ni toca su `timelineEvents` (la hidratación de ICS-85 oculta
 * el evento). Conserva los enlaces de auditoría (`followUpId`, `nextFollowUpId`).
 */
export const remove = mutation({
  args: { id: v.id("interactions") },
  handler: async (ctx, { id }) => {
    const user = await requireVendedor(ctx);
    const interaction = await ctx.db.get(id);
    if (!interaction) throw new Error("Interacción no encontrada.");
    if (interaction.registeredBy !== user._id) {
      throw new Error("Solo puedes eliminar interacciones que tú registraste.");
    }
    if (interaction.deletedAt) {
      throw new Error("La interacción ya fue eliminada.");
    }
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: user._id });
    return { ok: true };
  },
});
