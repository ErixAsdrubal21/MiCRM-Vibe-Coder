/**
 * Enums de dominio del CRM — fuente única de verdad (ICS-78).
 *
 * Módulo NEUTRAL: no importa nada de servidor (`convex/*`, `convex/values`) ni
 * de cliente (`react`, `next`). Lo consumen:
 *   - `convex/validators.js` → arma los `v.union(...)` del esquema y las mutations.
 *   - `src/lib/prospects.js` → constantes y etiquetas de la UI.
 *
 * Un dominio por bloque: cada uno expone su array de valores (`*_VALUES`, el
 * orden es el canónico) y, cuando aplica, su mapa de etiquetas / iconos. Los
 * dominios son distintos y no se mezclan entre sí.
 */

// — Etapa del pipeline —
export const STAGE_VALUES = ["nuevo", "contactado", "cotizacion", "negociacion", "ganado", "perdido"];
export const STAGE_LABELS = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cotizacion: "Cotización enviada",
  negociacion: "En negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};
export const ACTIVE_STAGE_VALUES = ["nuevo", "contactado", "cotizacion", "negociacion"];

// — Tipo de contacto de una interacción —
// `otro` existe para alinear con los seguimientos (un follow-up `otro` que se
// completa genera una interacción del mismo tipo). La UI de alta manual puede
// ofrecer un subconjunto ordenado (ver `CONTACT_TYPES` en src/lib/prospects.js).
export const CONTACT_TYPE_VALUES = ["llamada", "whatsapp", "visita", "email", "otro"];
export const CONTACT_TYPE_LABELS = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  visita: "Visita",
  email: "Email",
  otro: "Otro",
};
export const CONTACT_TYPE_ICONS = {
  llamada: "phone",
  whatsapp: "message-circle",
  visita: "map-pin",
  email: "mail",
  otro: "circle",
};

// — Tipo de un próximo seguimiento (followUps.type) — sin `email`, con `otro`.
export const FOLLOW_UP_TYPE_VALUES = ["llamada", "whatsapp", "visita", "otro"];

// — Canal de entrada del prospecto —
export const CHANNEL_VALUES = ["whatsapp", "referido", "redes", "visita", "otro"];
export const CHANNEL_LABELS = {
  whatsapp: "WhatsApp",
  referido: "Referido",
  redes: "Redes",
  visita: "Visita",
  otro: "Otro",
};

// — Motivo de pérdida —
export const LOSS_REASON_VALUES = ["precio", "competencia", "sin-respuesta", "tiempo", "otro"];
export const LOSS_REASON_LABELS = {
  precio: "Precio",
  competencia: "Competencia",
  "sin-respuesta": "Sin respuesta",
  tiempo: "Tiempo",
  otro: "Otro",
};

// — Resultado / sentimiento de una interacción (ICS-78) —
export const OUTCOME_VALUES = ["positivo", "neutro", "negativo", "sin-respuesta"];
export const OUTCOME_LABELS = {
  positivo: "Positivo",
  neutro: "Neutro",
  negativo: "Negativo",
  "sin-respuesta": "Sin respuesta",
};

// — Resolución al cerrar un seguimiento (ICS-78) —
export const RESOLUTION_VALUES = ["hecho", "no-contactado", "reprogramado", "cancelado"];
export const RESOLUTION_LABELS = {
  hecho: "Realizado",
  "no-contactado": "Sin contacto",
  reprogramado: "Reprogramado",
  cancelado: "Cancelado",
};

// — Origen de una interacción (ICS-78) — `manual` ausente se trata como `manual`.
export const INTERACTION_SOURCE_VALUES = ["manual", "follow-up", "sistema"];

// — Tipo de evento en la línea de tiempo de la ficha (ICS-78) —
export const TIMELINE_EVENT_TYPE_VALUES = ["interaccion", "cambio-etapa", "cierre-seguimiento", "venta"];

// — Roles —
export const ROLE_VALUES = ["administrador", "vendedor"];
