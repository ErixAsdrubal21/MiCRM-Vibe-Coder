"use client";

/**
 * Button — acción primaria/secundaria del sistema.
 * Radio `md` (16px) por default — el acento (`--color-accent`) es CTA-only,
 * nunca lo uses fuera de `variant="primary"`.
 */
export function Button({
  variant = "primary",
  pill = false,
  full = false,
  children,
  ...rest
}) {
  const classes = [
    "mn-button",
    `mn-button--${variant}`,
    pill && "mn-button--pill",
    full && "mn-button--full",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}