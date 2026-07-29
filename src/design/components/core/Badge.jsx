"use client";

const LABELS = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cotizacion: "Cotización enviada",
  negociacion: "En negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

/**
 * Badge — pill de etapa del pipeline. 6 etapas fijas y exclusivas (PRD),
 * siempre texto a color sobre fondo tint — nunca fondo sólido saturado.
 */
export function Badge({ stage, className = "" }) {
  return (
    <span className={`mn-badge mn-badge--${stage} ${className}`.trim()}>
      {LABELS[stage] ?? stage}
    </span>
  );
}