/**
 * Constantes y helpers puros — puerto de la mitad "constantes + helpers" de
 * prospectsStore.js en mi-crm (la mitad "store" ahora vive en Convex).
 * Adaptado a timestamps numéricos (Date.now()), no ISO strings.
 */

export const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referido", label: "Referido" },
  { value: "redes", label: "Redes" },
  { value: "visita", label: "Visita" },
  { value: "otro", label: "Otro" },
];

export const STAGES = ["nuevo", "contactado", "cotizacion", "negociacion", "ganado", "perdido"];
export const ACTIVE_STAGES = ["nuevo", "contactado", "cotizacion", "negociacion"];

export const STAGE_LABELS = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cotizacion: "Cotización enviada",
  negociacion: "En negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

export const LOSS_REASONS = [
  { value: "precio", label: "Precio" },
  { value: "competencia", label: "Competencia" },
  { value: "sin-respuesta", label: "Sin respuesta" },
  { value: "tiempo", label: "Tiempo" },
  { value: "otro", label: "Otro" },
];

export const CONTACT_TYPES = [
  { value: "whatsapp", label: "WhatsApp", icon: "message-circle" },
  { value: "llamada", label: "Llamada", icon: "phone" },
  { value: "visita", label: "Visita", icon: "map-pin" },
  { value: "email", label: "Email", icon: "mail" },
];

/** Subset usado por "próximo seguimiento" — el mockup confirmado no incluye email ahí. */
export const FOLLOW_UP_TYPES = CONTACT_TYPES.filter((t) => t.value !== "email");

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

const LOSS_REASON_LABELS = { precio: "precio", competencia: "competencia", "sin-respuesta": "sin respuesta", tiempo: "tiempo", otro: "otro" };

/** Texto corto de "última actividad" para una fila de la lista — mismo criterio de riesgo (>3 días) que el PRD. */
export function contactMetaLabel(prospect) {
  const days = daysSinceContact(prospect);
  if (prospect.stage === "perdido") return `Motivo: ${LOSS_REASON_LABELS[prospect.lossReason] ?? prospect.lossReason ?? "sin especificar"}`;
  if (prospect.stage === "ganado") {
    if (days < 7) return days === 0 ? "Cerrado hoy" : `Cerrado hace ${days} día${days === 1 ? "" : "s"}`;
    const weeks = Math.floor(days / 7);
    return `Cerrado hace ${weeks} semana${weeks === 1 ? "" : "s"}`;
  }
  if (days === 0) return "Contactar hoy";
  if (days > 3) return `Sin contacto hace ${days} días`;
  return `Hace ${days} día${days === 1 ? "" : "s"}`;
}

const CONTACT_TYPE_LABELS = { llamada: "llamada", whatsapp: "WhatsApp", visita: "visita", email: "email", otro: "otro" };

export function contactTypeLabel(type) {
  return CONTACT_TYPE_LABELS[type] ?? type;
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
