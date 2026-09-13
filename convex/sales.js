import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAuthenticatedUser, requireOwnedProspect, requireAdministrador, requireProspectRead } from "./permissions";
import { recordTimelineEvent, requireBoundedText, resolveClosedAt } from "./lib";
import { collectFilteredPage, hydrateByIds } from "./pagination";

/**
 * ICS-101 — histórico de ventas: inmutable (nunca se edita ni se borra;
 * corregir = anular + `createDirect` de la correcta), anulable solo por
 * administrador (`void`, B3 — no reabre la oportunidad). `opportunities.win`
 * (el otro camino para crear una venta) vive en `opportunities.js` porque
 * cierra la oportunidad en la misma transacción.
 */

export const createDirect = mutation({
  args: {
    prospectId: v.id("prospects"),
    amount: v.number(),
    product: v.string(),
    closedDate: v.optional(v.string()),
  },
  handler: async (ctx, { prospectId, amount, product, closedDate }) => {
    const { user, prospect } = await requireOwnedProspect(ctx, prospectId);
    if (!amount || amount <= 0) throw new Error("El monto debe ser mayor a 0.");
    const cleanProduct = requireBoundedText(product, "producto", 1, 120);
    const closedAt = resolveClosedAt(closedDate);
    const saleId = await ctx.db.insert("sales", {
      prospectId,
      amount,
      product: cleanProduct,
      closedAt,
      closedBy: user._id,
      ownerId: prospect.ownerId,
      // opportunityId ausente — venta directa, sin oportunidad previa.
    });
    await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "venta", actorId: user._id, saleId });
    return ctx.db.get(saleId);
  },
});

/**
 * Anula una venta (solo admin). Nunca `delete` — queda `voidedAt/voidedBy/
 * voidReason`. NO reabre la oportunidad ganada que la generó (B3): la
 * oportunidad sigue "ganada", solo se corrigen los ingresos.
 *
 * Exportado como `void` (palabra reservada de JS — no se puede usar como
 * nombre de `const`, así que se define con otro nombre y se re-exporta con
 * el alias; Convex expone la función bajo el nombre exportado, `sales:void`).
 */
const voidSaleMutation = mutation({
  args: { id: v.id("sales"), reason: v.string() },
  handler: async (ctx, { id, reason }) => {
    const user = await requireAdministrador(ctx);
    const sale = await ctx.db.get(id);
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.voidedAt) throw new Error("Esta venta ya está anulada.");
    const cleanReason = requireBoundedText(reason, "motivo", 1, 500);
    const now = Date.now();
    await ctx.db.patch(id, { voidedAt: now, voidedBy: user._id, voidReason: cleanReason });
    await recordTimelineEvent(ctx, { prospectId: sale.prospectId, at: now, type: "venta-anulada", actorId: user._id, saleId: id });
    return ctx.db.get(id);
  },
});
export { voidSaleMutation as void };

/**
 * Histórico global (`/ventas`, vista "Ventas"). Un solo índice base por
 * request (patrón ICS-81): `prospectId` → `by_prospect_and_closedAt`;
 * vendedor (o admin filtrando vendedor) → `by_owner_and_closedAt`; admin sin
 * filtro → `by_closedAt`. Excluye anuladas por defecto.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filters: v.optional(
      v.object({
        ownerId: v.optional(v.id("users")),
        prospectId: v.optional(v.id("prospects")),
        from: v.optional(v.number()),
        to: v.optional(v.number()),
        includeVoided: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { paginationOpts, filters = {} }) => {
    const user = await requireAuthenticatedUser(ctx);
    const { prospectId, from, to, includeVoided = false } = filters;
    const scopedOwnerId = user.role === "vendedor" ? user._id : filters.ownerId;

    const withRange = (q, field) => {
      let r = q;
      if (from !== undefined) r = r.gte(field, from);
      if (to !== undefined) r = r.lte(field, to);
      return r;
    };

    let makeQuery;
    if (prospectId) {
      makeQuery = () =>
        ctx.db
          .query("sales")
          .withIndex("by_prospect_and_closedAt", (q) => withRange(q.eq("prospectId", prospectId), "closedAt"))
          .order("desc");
    } else if (scopedOwnerId) {
      makeQuery = () =>
        ctx.db
          .query("sales")
          .withIndex("by_owner_and_closedAt", (q) => withRange(q.eq("ownerId", scopedOwnerId), "closedAt"))
          .order("desc");
    } else {
      makeQuery = () =>
        ctx.db
          .query("sales")
          .withIndex("by_closedAt", (q) => withRange(q, "closedAt"))
          .order("desc");
    }

    const predicate = (s) => includeVoided || !s.voidedAt;
    const result = await collectFilteredPage(makeQuery, paginationOpts, predicate);

    const prospectIds = new Set(result.page.map((s) => s.prospectId));
    const prospects = await hydrateByIds(ctx, prospectIds);
    return {
      ...result,
      page: result.page.map((s) => ({ ...s, prospectName: prospects.get(s.prospectId)?.name ?? null })),
    };
  },
});

/** Historial de ventas de un cliente (ficha), paginado. Incluye anuladas — la UI las marca. */
export const listByProspect = query({
  args: { prospectId: v.id("prospects"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { prospectId, paginationOpts }) => {
    await requireProspectRead(ctx, prospectId);
    return ctx.db
      .query("sales")
      .withIndex("by_prospect_and_closedAt", (q) => q.eq("prospectId", prospectId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

/** Detalle de una venta: venta + prospecto + oportunidad de origen (si la hay). */
export const getById = query({
  args: { id: v.id("sales") },
  handler: async (ctx, { id }) => {
    const sale = await ctx.db.get(id);
    if (!sale) throw new Error("Venta no encontrada.");
    await requireProspectRead(ctx, sale.prospectId);
    const [prospect, opportunity] = await Promise.all([
      ctx.db.get(sale.prospectId),
      sale.opportunityId ? ctx.db.get(sale.opportunityId) : null,
    ]);
    return { ...sale, prospect, opportunity };
  },
});
