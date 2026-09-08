/** Helpers compartidos entre prospects.js / interactions.js / followUps.js. */

import { ACTIVE_STAGE_VALUES } from "../shared/crmEnums.js";

export const ACTIVE_STAGES = ACTIVE_STAGE_VALUES;

export function isActiveStage(stage) {
  return ACTIVE_STAGES.includes(stage);
}

export function daysSince(ms) {
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

/** Última interacción del prospecto, o `fallback` (normalmente _creationTime) si no tiene ninguna. */
export async function lastContactAt(ctx, prospectId, fallback) {
  const last = await ctx.db
    .query("interactions")
    .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
    .order("desc")
    .first();
  return last ? last.at : fallback;
}

/** El followUp con status "pendiente" de este prospecto, si existe (a lo más uno a la vez). */
export async function pendingFollowUp(ctx, prospectId) {
  return ctx.db
    .query("followUps")
    .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
    .filter((q) => q.eq(q.field("status"), "pendiente"))
    .first();
}

/**
 * ICS-78 — invariante: mientras un follow-up esté `pendiente`, su `ownerId`
 * debe reflejar el `ownerId` actual del prospecto. Cualquier mutation que
 * cambie `prospects.ownerId` (reasignación de cartera) debe llamar a este
 * helper. Hoy no existe esa mutation (MVP monovendedor); queda listo para
 * ICS-80 / la funcionalidad de reasignación.
 */
export async function syncPendingFollowUpOwner(ctx, prospectId, ownerId) {
  const pending = await ctx.db
    .query("followUps")
    .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
    .filter((q) => q.eq(q.field("status"), "pendiente"))
    .collect();
  for (const followUp of pending) {
    if (followUp.ownerId !== ownerId) {
      await ctx.db.patch(followUp._id, { ownerId });
    }
  }
}

/**
 * Zona del negocio (ICS-92). Un seguimiento se agenda para un DÍA calendario,
 * no un instante — "hoy / ayer / mañana / vencido" son preguntas sobre días de
 * México, no sobre husos del servidor (Convex corre en UTC) ni del navegador.
 */
const BUSINESS_TZ = "America/Mexico_City";
const bizDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" de hoy en la zona del negocio. El servidor es la fuente de "hoy". */
export function businessToday() {
  return bizDayFmt.format(new Date());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida el formato y que sea una fecha real ("2026-02-31" no lo es). */
export function isValidCalendarDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * "YYYY-MM-DD" → timestamp de las 12:00 UTC de ese día. Mediodía UTC es el
 * ancla que cae en el día calendario correcto al mostrarse en cualquier zona
 * de UTC-12 a UTC+11 (México, UTC-6, con margen de sobra). Sin aritmética de
 * offsets.
 */
export function calendarDateToMs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

/** "YYYY-MM-DD" de ese timestamp, en la zona del negocio — para leer de vuelta. */
export function msToBusinessDate(ms) {
  return bizDayFmt.format(new Date(ms));
}
