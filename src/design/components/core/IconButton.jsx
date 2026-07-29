"use client";

import { Icon } from "./Icon.jsx";

/**
 * IconButton — botón cuadrado 40×40 solo-ícono.
 */
export function IconButton({ icon, outline = false, label, ...rest }) {
  const classes = ["mn-icon-button", outline && "mn-icon-button--outline"]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} aria-label={label} {...rest}>
      <Icon name={icon} size={20} />
    </button>
  );
}