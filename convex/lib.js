/** Helpers compartidos entre prospects.js / interactions.js / followUps.js. */

import { ACTIVE_STAGE_VALUES, TIMELINE_EVENT_TYPE_VALUES } from "../shared/crmEnums.js";

export const ACTIVE_STAGES = ACTIVE_STAGE_VALUES;

export function isActiveStage(stage) {
  return ACTIVE_STAGES.includes(stage);
}

export function daysSince(ms) {
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

/**
 * `at` de la última interacción NO borrada del prospecto, o `fallback`
 * (normalmente `_creationTime`) si no tiene ninguna. Ordena por `at` —no por
 * `_creationTime`— porque ICS-79 permite interacciones retroactivas: la más
 * reciente por fecha de contacto puede no ser la última creada. Excluye las
 * que tienen `deletedAt` (ICS-79).
 */
export async function lastContactAt(ctx, prospectId, fallback) {
  const last = await ctx.db
    .query("interactions")
    .withIndex("by_prospect_and_at", (q) => q.eq("prospectId", prospectId))
    .order("desc")
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
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
 * ICS-85 — `timelineEvents` es la ÚNICA fuente cronológica de la ficha
 * (ICS-86), append-only. Este helper es el único punto de escritura: siempre
 * `insert`, nunca `patch` ni `delete` de un evento. Su firma es estable para
 * que las mutations de ICS-79 (interacciones) e ICS-80 (seguimientos / cambio
 * de etapa) lo llamen sin acoplarse a la forma de la tabla.
 *
 * Campo obligatorio por `type` (además de `prospectId`, `at`, `type`):
 *   - `interaccion`         → `interactionId`  (+ `actorId` = quien la registró)
 *   - `cambio-etapa`        → `toStage`        (`fromStage` ausente = primer evento)
 *   - `cierre-seguimiento`  → `followUpId`     (+ `interactionId` de la nota de cierre)
 *   - `venta`               → `saleId`
 * `actorId` es recomendable siempre salvo en eventos sintéticos del backfill.
 */
const TIMELINE_REQUIRED_FIELD = {
  interaccion: "interactionId",
  "cambio-etapa": "toStage",
  "cierre-seguimiento": "followUpId",
  venta: "saleId",
};

export async function recordTimelineEvent(
  ctx,
  { prospectId, at, type, actorId, interactionId, followUpId, saleId, fromStage, toStage },
) {
  if (!TIMELINE_EVENT_TYPE_VALUES.includes(type)) {
    throw new Error(`Tipo de evento de línea de tiempo desconocido: ${type}`);
  }
  const required = TIMELINE_REQUIRED_FIELD[type];
  const fields = { prospectId, at, type, actorId, interactionId, followUpId, saleId, fromStage, toStage };
  if (fields[required] === undefined || fields[required] === null) {
    throw new Error(`Un evento "${type}" requiere ${required}.`);
  }
  // Omitir las claves ausentes en vez de guardar `undefined` explícito.
  const doc = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) doc[key] = value;
  }
  return ctx.db.insert("timelineEvents", doc);
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

/**
 * Valida el formato, que sea una fecha real ("2026-02-31" no lo es) y que el
 * año caiga en un rango operativo (2000–2100). El límite del año cierra el
 * borde de `Date.UTC(y, ...)`, que remapea años 0–99 a 1900–1999: sin esto,
 * "0099-01-01" pasaría el resto de la validación y `calendarDateToMs` lo
 * guardaría como 1999.
 */
export function isValidCalendarDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const year = Number(s.slice(0, 4));
  if (year < 2000 || year > 2100) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * "YYYY-MM-DD" → timestamp de las 12:00 UTC de ese día. Asume un año de 4
 * dígitos ya validado por `isValidCalendarDate` (evita el remapeo 0–99 →
 * 1900–1999 de `Date.UTC`). Mediodía UTC es el ancla que cae en el día
 * calendario correcto al mostrarse en cualquier zona de UTC-12 a UTC+11
 * (México, UTC-6, con margen de sobra). Sin aritmética de offsets.
 */
export function calendarDateToMs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

/** "YYYY-MM-DD" de ese timestamp, en la zona del negocio — para leer de vuelta. */
export function msToBusinessDate(ms) {
  return bizDayFmt.format(new Date(ms));
}

/**
 * Instante (exclusivo) en que termina "hoy" en la zona del negocio: la
 * medianoche del día siguiente en México (UTC-6 fijo, sin DST desde 2022).
 * Lo usa `followUps.today` (ICS-80) como cota superior del índice
 * `by_status_and_date` — "vencido o para hoy" = `followUp.at < este valor` —
 * sin escanear la tabla `prospects`.
 */
export function endOfBusinessTodayMs() {
  const tomorrow = msToBusinessDate(calendarDateToMs(businessToday()) + 24 * 60 * 60 * 1000);
  return Date.parse(`${tomorrow}T00:00:00-06:00`);
}
