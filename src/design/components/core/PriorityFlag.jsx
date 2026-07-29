"use client";

const LABELS = { alta: "Prioridad alta", media: "Prioridad media", baja: "Prioridad baja" };

/**
 * PriorityFlag — componente NUEVO frente a la versión anterior del sistema.
 * Respalda la mejora "Etiquetar clientes por prioridad" registrada en
 * `CRM, cambios y mejoras` (Notion, 2026-07-05) — pendiente de confirmar
 * como parte del alcance, sin tareas creadas en Linear todavía.
 *
 * Forma deliberadamente distinta a Badge (chip con punto + borde hairline,
 * no pill sólido) para no confundir "en qué etapa va" con "qué tan urgente es".
 */
export function PriorityFlag({ level, inline = false }) {
  const classes = [
    "mn-priority-flag",
    `mn-priority-flag--${level}`,
    inline && "mn-priority-flag--inline",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <span className="mn-priority-flag__dot" />
      {LABELS[level] ?? level}
    </span>
  );
}