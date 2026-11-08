"use node";

import Exa from "exa-js";
import { action } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { PROSPECT_QUERY_MAX, PROSPECT_QUERY_MIN, isSafeLink, websiteHost } from "../shared/webResearch.js";

/**
 * ICS-138..141 — llamadas a Exa (SDK `exa-js`). Runtime de Node porque
 * `exa-js` usa `cross-fetch`. `EXA_API_KEY` vive solo en el entorno de
 * Convex; nunca llega al navegador.
 *
 * Cada action: (1) `webResearch.reserve` revisa permisos y tope y reserva el
 * cupo; (2) llama a Exa; (3) guarda el resultado (perfil/noticias) o lo
 * devuelve (prospectar). Si Exa falla, el cupo se devuelve.
 */

const TIMEOUT_MS = 15_000;
const SNIPPET_MAX = 400;
const NEWS_DAYS = 90;

function client() {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new ConvexError("La búsqueda web no está configurada todavía (falta EXA_API_KEY en Convex).");
  return new Exa(apiKey);
}

/** Resultado de Exa → forma que guarda y muestra el CRM. Descarta enlaces que no sean http/https. */
function toResults(response) {
  return (response.results ?? [])
    .filter((r) => r.url && isSafeLink(r.url))
    .map((r) => {
      const source = websiteHost(r.url);
      const snippet = (r.highlights ?? [])
        .join(" … ")
        .replace(/(^|\s)#{1,6}\s+/g, "$1") // títulos markdown de la página ("# Grupo Bimbo")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, SNIPPET_MAX);
      return {
        title: (r.title ?? "").trim() || source,
        url: r.url,
        source,
        ...(snippet ? { snippet } : {}),
        ...(r.publishedDate ? { publishedDate: String(r.publishedDate).slice(0, 10) } : {}),
      };
    });
}

/** Llama a Exa; ante cualquier falla devuelve el cupo y lanza un mensaje entendible. */
async function runSearch(ctx, usageId, query, options) {
  try {
    return toResults(
      await client().search(query, { ...options, userLocation: "MX", contents: { highlights: true }, timeout: TIMEOUT_MS }),
    );
  } catch (err) {
    await ctx.runMutation(internal.webResearch.release, { usageId });
    if (err instanceof ConvexError) throw err;
    const status = err?.statusCode ?? err?.status;
    console.error("Exa falló", status, err?.message);
    if (status === 401 || status === 403) throw new ConvexError("La llave de Exa no es válida. Avisa a la administradora.");
    if (status === 429) throw new ConvexError("El servicio de búsqueda está saturado. Intenta en un minuto.");
    throw new ConvexError("No se pudo completar la búsqueda web. Intenta de nuevo.");
  }
}

/** Ficha: perfil (ICS-139) o noticias (ICS-140) de la empresa del prospecto. */
export const researchProspect = action({
  args: {
    prospectId: v.id("prospects"),
    kind: v.union(v.literal("perfil"), v.literal("noticias")),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { prospectId, kind, force }) => {
    const reserved = await ctx.runMutation(internal.webResearch.reserve, { kind, prospectId, force });
    if (reserved.cached) return { cached: true };
    const { usageId, userId, subject } = reserved;
    const name = subject.company || subject.host;

    let query;
    let options;
    if (kind === "perfil") {
      query = subject.company && subject.host ? `${subject.company} (${subject.host})` : name;
      options = { numResults: 5 };
    } else {
      query = `Noticias sobre ${name}`;
      const since = new Date(Date.now() - NEWS_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      options = { numResults: 8, category: "news", startPublishedDate: since };
    }

    const results = await runSearch(ctx, usageId, query, options);
    await ctx.runMutation(internal.webResearch.store, { prospectId, kind, query, results, userId, subject });
    return { cached: false, count: results.length };
  },
});

/** ICS-141: empresas que coinciden con una descripción libre. No se guarda nada. */
export const findProspects = action({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const text = query.trim().replace(/\s+/g, " ");
    if (text.length < PROSPECT_QUERY_MIN || text.length > PROSPECT_QUERY_MAX) {
      throw new ConvexError(`Describe lo que buscas en ${PROSPECT_QUERY_MIN} a ${PROSPECT_QUERY_MAX} caracteres.`);
    }
    const { usageId } = await ctx.runMutation(internal.webResearch.reserve, { kind: "prospectar" });
    return runSearch(ctx, usageId, text, { numResults: 10, category: "company" });
  },
});
