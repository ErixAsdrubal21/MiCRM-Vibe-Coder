/**
 * ICS-138 — reglas compartidas de la investigación web con Exa. Módulo
 * NEUTRAL (como `crmEnums.js`): lo usan Convex y la UI.
 */

/** Búsquedas pagadas por persona en una ventana móvil de 24 h (las tres funciones juntas). */
export const EXA_DAILY_LIMIT = 30;
export const EXA_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Vigencia del resultado guardado antes de ofrecer "Actualizar" como necesario. */
export const RESEARCH_TTL_MS = {
  perfil: 7 * 24 * 60 * 60 * 1000,
  noticias: 24 * 60 * 60 * 1000,
};

export const COMPANY_MAX = 120;
export const WEBSITE_MAX = 200;
export const PROSPECT_QUERY_MIN = 3;
export const PROSPECT_QUERY_MAX = 200;

/**
 * Normaliza el sitio web que escribe la persona: sin espacios, con `https://`
 * si no trae protocolo. Devuelve `""` si está vacío y `null` si no es una
 * dirección web válida (http/https con un dominio que tenga punto).
 */
export function normalizeWebsite(raw) {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "";
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    if (url.username || url.password) return null; // p. ej. "mailto:x@y.com" → https://mailto:x@y.com
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Dominio sin `www.` de una URL ya normalizada (o `""`). */
export function websiteHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Solo enlaces http/https: un resultado con otro esquema no se muestra. */
export function isSafeLink(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
