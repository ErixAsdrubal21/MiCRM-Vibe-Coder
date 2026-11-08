import { internalMutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAuthenticatedUser, requireProspectRead } from "./permissions";
import { EXA_DAILY_LIMIT, EXA_WINDOW_MS, RESEARCH_TTL_MS, websiteHost } from "../shared/webResearch.js";

/**
 * ICS-138..141 — investigación web con Exa: datos, permisos y tope diario.
 * Las llamadas a Exa viven en `convex/exa.js` (action de Node); aquí solo se
 * decide, en una transacción, si se puede buscar y qué se le manda.
 *
 * Reglas:
 *   - A Exa solo se le manda la empresa o el sitio web del prospecto, nunca su
 *     nombre ni su teléfono. Sin empresa ni web, no se busca.
 *   - Perfil/noticias: vendedor en su cartera, administradora en todas
 *     (`requireProspectRead`). Buscar prospectos nuevos: ambos roles.
 *   - Tope: EXA_DAILY_LIMIT búsquedas por persona en 24 h, sumando las tres
 *     funciones. El cupo se reserva ANTES de llamar a Exa (las transacciones
 *     son serializables: dos clics simultáneos no se saltan el tope) y se
 *     devuelve si Exa falla.
 */

const researchKind = v.union(v.literal("perfil"), v.literal("noticias"));
const usageKind = v.union(v.literal("perfil"), v.literal("noticias"), v.literal("prospectar"));

const resultValidator = v.object({
  title: v.string(),
  url: v.string(),
  source: v.string(),
  snippet: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
});

async function usageRows(db, userId, now) {
  return db
    .query("exaUsage")
    .withIndex("by_user_and_at", (q) => q.eq("userId", userId).gt("at", now - EXA_WINDOW_MS))
    .collect();
}

/** Lo que se le manda a Exa para un prospecto, o `null` si no tiene empresa ni web. */
export function researchSubject(prospect) {
  const company = prospect.company?.trim() || "";
  const host = prospect.website ? websiteHost(prospect.website) : "";
  if (!company && !host) return null;
  return { company, host };
}

/** Cupo restante de la persona autenticada. */
export const myUsage = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx);
    const used = (await usageRows(ctx.db, user._id, Date.now())).length;
    return { used, limit: EXA_DAILY_LIMIT, remaining: Math.max(0, EXA_DAILY_LIMIT - used) };
  },
});

/** Ficha: resultados guardados de perfil y noticias + si se puede buscar. */
export const byProspect = query({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const { prospect } = await requireProspectRead(ctx, prospectId);
    const rows = await ctx.db
      .query("webResearch")
      .withIndex("by_prospect_and_kind", (q) => q.eq("prospectId", prospectId))
      .collect();
    const pick = (kind) => {
      const row = rows.find((r) => r.kind === kind);
      if (!row) return null;
      return {
        results: row.results,
        fetchedAt: row.fetchedAt,
        stale: row.fetchedAt < Date.now() - RESEARCH_TTL_MS[kind],
      };
    };
    return { canSearch: researchSubject(prospect) !== null, perfil: pick("perfil"), noticias: pick("noticias") };
  },
});

/**
 * Paso 1 (desde la action): permisos + tope + reserva del cupo. Devuelve el
 * sujeto de búsqueda y el id del cupo, o `{ cached: true }` si ya hay un
 * resultado vigente y no se pidió actualizar.
 */
export const reserve = internalMutation({
  args: { kind: usageKind, prospectId: v.optional(v.id("prospects")), force: v.optional(v.boolean()) },
  handler: async (ctx, { kind, prospectId, force }) => {
    const now = Date.now();
    let user;
    let subject = null;
    if (kind === "prospectar") {
      user = await requireAuthenticatedUser(ctx);
    } else {
      if (!prospectId) throw new ConvexError("Falta el prospecto.");
      const read = await requireProspectRead(ctx, prospectId);
      user = read.user;
      subject = researchSubject(read.prospect);
      if (!subject) throw new ConvexError("Agrega la empresa o el sitio web del prospecto para buscarlo en la web.");
      if (!force) {
        const saved = await ctx.db
          .query("webResearch")
          .withIndex("by_prospect_and_kind", (q) => q.eq("prospectId", prospectId).eq("kind", kind))
          .unique();
        if (saved && saved.fetchedAt >= now - RESEARCH_TTL_MS[kind]) return { cached: true };
      }
    }

    // Limpieza de filas fuera de la ventana (de esta persona).
    const old = await ctx.db
      .query("exaUsage")
      .withIndex("by_user_and_at", (q) => q.eq("userId", user._id).lte("at", now - EXA_WINDOW_MS))
      .take(100);
    for (const row of old) await ctx.db.delete(row._id);

    if ((await usageRows(ctx.db, user._id, now)).length >= EXA_DAILY_LIMIT) {
      throw new ConvexError(`Llegaste al tope de ${EXA_DAILY_LIMIT} búsquedas web en 24 horas. Intenta más tarde.`);
    }
    const usageId = await ctx.db.insert("exaUsage", { userId: user._id, at: now, kind });
    return { cached: false, usageId, userId: user._id, subject };
  },
});

/** Devuelve el cupo si Exa falló (la búsqueda no se cobró o no sirvió). */
export const release = internalMutation({
  args: { usageId: v.id("exaUsage") },
  handler: async (ctx, { usageId }) => {
    if (await ctx.db.get(usageId)) await ctx.db.delete(usageId);
  },
});

/** Paso 3: guarda el resultado de perfil/noticias, reemplazando el anterior. */
export const store = internalMutation({
  args: {
    prospectId: v.id("prospects"),
    kind: researchKind,
    query: v.string(),
    results: v.array(resultValidator),
    userId: v.id("users"),
    subject: v.object({ company: v.string(), host: v.string() }),
  },
  handler: async (ctx, { prospectId, kind, query: q, results, userId, subject }) => {
    // Si editaron la empresa o la web mientras Exa respondía, el resultado ya no es de este prospecto.
    const prospect = await ctx.db.get(prospectId);
    const current = prospect && researchSubject(prospect);
    if (!current || current.company !== subject.company || current.host !== subject.host) return false;
    const previous = await ctx.db
      .query("webResearch")
      .withIndex("by_prospect_and_kind", (x) => x.eq("prospectId", prospectId).eq("kind", kind))
      .collect();
    for (const row of previous) await ctx.db.delete(row._id);
    await ctx.db.insert("webResearch", { prospectId, kind, query: q, results, fetchedAt: Date.now(), fetchedBy: userId });
    return true;
  },
});
