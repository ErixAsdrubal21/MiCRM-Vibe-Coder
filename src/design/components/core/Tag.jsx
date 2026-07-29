"use client";

import { Icon } from "./Icon.jsx";

/**
 * Tag — texto inline + ícono para metadata (riesgo, éxito, neutral).
 * A diferencia de Badge (etapa fija), Tag es de propósito general:
 * "Sin contacto hace 4 días", "Venta confirmada", "48h para responder".
 */
export function Tag({ variant = "neutral", icon, children }) {
  return (
    <span className={`mn-tag mn-tag--${variant}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}