/**
 * Constantes y helpers puros — puerto de la mitad "constantes + helpers" de
 * prospectsStore.js en mi-crm (la mitad "store" ahora vive en Convex).
 * Adaptado a timestamps numéricos (Date.now()), no ISO strings.
 *
 * Los valores y etiquetas de cada enum vienen de `shared/crmEnums.js` (ICS-78)
 * — este archivo solo les da la forma / el orden que usa la UI del CRM.
 */
import {
  CHANNEL_VALUES,
  CHANNEL_LABELS,
  STAGE_VALUES,
  ACTIVE_STAGE_VALUES,
  STAGE_LABELS as SHARED_STAGE_LABELS,
  LOSS_REASON_VALUES,
  LOSS_REASON_LABELS,
  CONTACT_TYPE_LABELS,
  CONTACT_TYPE_ICONS,
} from "../../shared/crmEnums.js";

export const CHANNELS = CHANNEL_VALUES.map((value) => ({ value, label: CHANNEL_LABELS[value] }));

export const STAGES = STAGE_VALUES;
export const ACTIVE_STAGES = ACTIVE_STAGE_VALUES;
export const STAGE_LABELS = SHARED_STAGE_LABELS;

export const LOSS_REASONS = LOSS_REASON_VALUES.map((value) => ({ value, label: LOSS_REASON_LABELS[value] }));

// Orden de los chips del formulario "Registrar interacción" (whatsapp primero,
// es el default). `otro` existe en el enum (alinea con followUps) pero todavía
// no se ofrece como chip manual — eso se revisa en ICS-79/ICS-86.
export const CONTACT_TYPES = ["whatsapp", "llamada", "visita", "email"].map((value) => ({
  value,
  label: CONTACT_TYPE_LABELS[value],
  icon: CONTACT_TYPE_ICONS[value],
}));

/** Subset usado por "próximo seguimiento" — el mockup confirmado no incluye email ahí. */
export const FOLLOW_UP_TYPES = CONTACT_TYPES.filter((t) => t.value !== "email");

/** Icono por tipo de contacto — única fuente (antes duplicado en ficha.js y tareas/page.js, ICS-86). */
export const CONTACT_ICON = CONTACT_TYPE_ICONS;

export function isActiveStage(stage) {
  return ACTIVE_STAGES.includes(stage);
}

export function daysSince(ms) {
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

/** Días desde que el prospecto entró a su etapa actual — Pipeline (ICS-14). */
export function daysInStage(prospect) {
  return daysSince(prospect.stageChangedAt);
}

/** Días desde el último contacto — usa lastContactAt calculado por prospects.list/get. */
export function daysSinceContact(prospect) {
  return daysSince(prospect.lastContactAt ?? prospect._creationTime);
}

export function sortedInteractions(interactions) {
  return [...interactions].sort((a, b) => b.at - a.at);
}

// Variante en minúsculas para prosa ("Motivo: sin respuesta") — distinta del
// label de chip/etiqueta (`LOSS_REASONS`, capitalizado) importado arriba.
const LOSS_REASON_PROSE_LABELS = { precio: "precio", competencia: "competencia", "sin-respuesta": "sin respuesta", tiempo: "tiempo", otro: "otro" };

/** Texto corto de "última actividad" para una fila de la lista — mismo criterio de riesgo (>3 días) que el PRD. */
export function contactMetaLabel(prospect) {
  const days = daysSinceContact(prospect);
  if (prospect.stage === "perdido") return `Motivo: ${LOSS_REASON_PROSE_LABELS[prospect.lossReason] ?? prospect.lossReason ?? "sin especificar"}`;
  if (prospect.stage === "ganado") {
    if (days < 7) return days === 0 ? "Cerrado hoy" : `Cerrado hace ${days} día${days === 1 ? "" : "s"}`;
    const weeks = Math.floor(days / 7);
    return `Cerrado hace ${weeks} semana${weeks === 1 ? "" : "s"}`;
  }
  if (days === 0) return "Contactar hoy";
  if (days > 3) return `Sin contacto hace ${days} días`;
  return `Hace ${days} día${days === 1 ? "" : "s"}`;
}

// Variante en minúsculas para prosa ("8 sept · llamada") — distinta del label
// de chip (`CONTACT_TYPES`, capitalizado) que viene de `CONTACT_TYPE_LABELS`.
const CONTACT_TYPE_PROSE_LABELS = { llamada: "llamada", whatsapp: "WhatsApp", visita: "visita", email: "email", otro: "otro" };

export function contactTypeLabel(type) {
  return CONTACT_TYPE_PROSE_LABELS[type] ?? type;
}

/** "mañana", "hoy", "en 3 días" o "hace 2 días" si quedó vencido — para el próximo seguimiento. */
export function relativeFollowUpLabel(atMs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(atMs);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer (vencido)";
  if (days > 1) return `en ${days} días`;
  return `hace ${Math.abs(days)} días (vencido)`;
}
