"use client";

const LABELS = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cotizacion: "Cotización enviada",
  negociacion: "En negociación",
  ganado: "Ganado",
  perdido: "Perdido",
  // ICS-102 — etapas de OPORTUNIDAD (convex/opportunities.js), pipeline
  // comercial real, distinto del pipeline de prospectos de arriba.
  // "cotizacion"/"negociacion" son las mismas claves que arriba a propósito
  // — comparten label y clase CSS (mismo tratamiento visual, ICS-98 B2).
  calificacion: "Calificación",
  ganada: "Ganada",
  perdida: "Perdida",
};

/**
 * Badge — pill de etapa. Sirve tanto al pipeline de prospectos (6 etapas
 * fijas del PRD) como al de oportunidades (ICS-99: calificación/cotización/
 * negociación/ganada/perdida) — son dos dominios distintos que nunca se
 * mezclan en la misma pantalla, pero comparten el mismo componente visual.
 * Siempre texto a color sobre fondo tint — nunca fondo sólido saturado.
 */
export function Badge({ stage, className = "" }) {
  return (
    <span className={`mn-badge mn-badge--${stage} ${className}`.trim()}>
      {LABELS[stage] ?? stage}
    </span>
  );
}