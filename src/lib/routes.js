/**
 * URLs de las pantallas que dependen de un ID. Con `output: "export"` (sitio
 * estático para Cloudflare Pages) no puede haber rutas dinámicas tipo
 * `/prospectos/[id]` — el ID de un registro no existe al compilar — así que
 * viaja como parámetro de consulta y cada pantalla lo lee con
 * `useSearchParams()`. Construirlas siempre desde aquí, nunca a mano.
 */

const withId = (path, id) => `${path}?id=${encodeURIComponent(id)}`;

/** Ficha del prospecto/cliente (Pantalla 5). */
export const prospectoHref = (id) => withId("/prospectos/ficha", id);

/** Registrar interacción de un prospecto (Pantalla 7). */
export const interaccionHref = (id) => withId("/prospectos/interaccion", id);

/** Detalle de una venta (ICS-103). */
export const ventaHref = (id) => withId("/ventas/detalle", id);
