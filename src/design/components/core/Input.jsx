"use client";

import { Icon } from "./Icon.jsx";

/**
 * Input — campo de búsqueda (pill, fondo surface-sunken) o campo de
 * formulario (variant="field", radio sm, fondo surface + borde hairline).
 */
export function Input({ variant = "search", icon = "search", ...rest }) {
  const classes = ["mn-input", variant === "field" && "mn-input--field"]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes}>
      {variant === "search" && <Icon name={icon} size={18} />}
      <input
        type="text"
        style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
        {...rest}
      />
    </label>
  );
}