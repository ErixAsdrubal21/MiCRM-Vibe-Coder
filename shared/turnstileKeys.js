/**
 * ICS-123 — llaves PÚBLICAS (site keys) del widget de Cloudflare Turnstile.
 * No son secretas: van en el HTML de la página. La secreta vive solo en el
 * entorno de Convex (TURNSTILE_SECRET_KEY; ver convex/turnstile.js).
 *
 * - Producción (Convex perfect-crocodile-599): el widget creado en el panel de
 *   Cloudflare para crm.icsaab.com. next.config.mjs se niega a compilar para
 *   producción si falta.
 * - Cualquier otro entorno (dev, vistas previas, local): la llave de prueba
 *   oficial de Cloudflare, que siempre aprueba.
 */
export const TURNSTILE_PROD_SITE_KEY = "";
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const PROD_CONVEX_DEPLOYMENT = "perfect-crocodile-599";

export function turnstileSiteKeyFor(convexUrl) {
  return String(convexUrl ?? "").includes(PROD_CONVEX_DEPLOYMENT) ? TURNSTILE_PROD_SITE_KEY : TURNSTILE_TEST_SITE_KEY;
}
