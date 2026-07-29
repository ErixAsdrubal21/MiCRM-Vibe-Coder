"use client";

import * as LucideIcons from "lucide-react";

/**
 * Icon — glifo outline único del sistema. Todo ícono pasa por aquí; nunca
 * SVGs sueltos ni emoji (ver design.md → Iconografía).
 *
 * @param {{ name: string, size?: number, className?: string }} props
 */
export function Icon({ name, size = 24, className = "" }) {
  const Component = LucideIcons[toPascalCase(name)];

  if (!Component) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Icon: "${name}" no existe en Lucide. Ver design.md → Iconografía para los nombres soportados.`);
    }
    return null;
  }

  return (
    <span className={`mn-icon ${className}`.trim()} style={{ width: size, height: size }}>
      <Component size={size} strokeWidth={1.75} absoluteStrokeWidth />
    </span>
  );
}

function toPascalCase(kebab) {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}