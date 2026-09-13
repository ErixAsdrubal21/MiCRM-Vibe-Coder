import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireVendedor, requireAuthenticatedUser, requireOwnedProspect, requireProspectRead } from "./permissions";
import { recordTimelineEvent, isValidCalendarDate, requireBoundedText, resolveClosedAt } from "./lib";
import { collectFilteredPage, hydrateByIds } from "./pagination";
import { opportunityStage, lossReason } from "./validators.js";
import { OPPORTUNITY_OPEN_STAGES } from "../shared/crmEnums.js";

/**
 * ICS-100/101 — backend de oportunidades. `create`/`update`/`markLost`/
 * `listByProspect`/`list` son ICS-100; `win` es ICS-101 (cierra transaccional
 * a venta, junto con `convex/sales.js`). Contrato completo: ICS-98.
 *
 * Aislamiento de cartera desde el día 1: `requireOwnedProspect` en toda
 * mutation (vendedor dueño del prospecto); `requireProspectRead` en
 * `listByProspect` (admin lee todo, vendedor solo lo suyo — B8).
 */

function requireExpectedCloseDate(expectedCloseDate) {
  if (expectedCloseDate === undefined) return undefined;
  if (!isValidCalendarDate(expectedCloseDate)) {
    throw new Error('Fecha esperada inválida (usa "YYYY-MM-DD").');
  }
  return expectedCloseDate;
}

/** `create`/`update` exigen monto > 0 — solo las migradas quedan con "monto pendiente" (ICS-98 B1). */
function requireEstimatedAmount(estimatedAmount) {
  if (typeof estimatedAmount !== "number" || estimatedAmount <= 0) {
    throw new Error("El monto estimado debe ser mayor a 0.");
  }
  return estimatedAmount;
}

export const create = mutation({
  args: {
    prospectId: v.id("prospects"),
    name: v.string(),
    product: v.string(),
    estimatedAmount: v.number(),
    stage: v.optional(opportunityStage),
    expectedCloseDate: v.optional(v.string()),
  },
  handler: async (ctx, { prospectId, name, product, estimatedAmount, stage: initialStage, expectedCloseDate }) => {
    const { user } = await requireOwnedProspect(ctx, prospectId);
    const targetStage = initialStage ?? "calificacion";
    if (!OPPORTUNITY_OPEN_STAGES.includes(targetStage)) {
      throw new Error("Una oportunidad se crea en una etapa abierta (calificación, cotización o negociación).");
    }
    const _id = await ctx.db.insert("opportunities", {
      prospectId,
      ownerId: user._id,
      name: requireBoundedText(name, "nombre", 1, 120),
      product: requireBoundedText(product, "producto", 1, 120),
      estimatedAmount: requireEstimatedAmount(estimatedAmount),
      stage: targetStage,
      expectedCloseDate: requireExpectedCloseDate(expectedCloseDate),
      source: "manual",
    });
    return ctx.db.get(_id);
  },
});

/** Solo el dueño, solo mientras está abierta. Ganar/perder NO se hace aquí — son sus propias mutations. */
export const update = mutation({
  args: {
    id: v.id("opportunities"),
    name: v.optional(v.string()),
    product: v.optional(v.string()),
    estimatedAmount: v.optional(v.number()),
    stage: v.optional(opportunityStage),
    expectedCloseDate: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, product, estimatedAmount, stage: newStage, expectedCloseDate }) => {
    const user = await requireVendedor(ctx);
    const opportunity = await ctx.db.get(id);
    if (!opportunity) throw new Error("Oportunidad no encontrada.");
    if (opportunity.ownerId !== user._id) {
      throw new Error("No puedes editar una oportunidad que no es tuya.");
    }
    if (!OPPORTUNITY_OPEN_STAGES.includes(opportunity.stage)) {
      throw new Error("Esta oportunidad ya está cerrada y no se puede editar.");
    }
    const patch = { editedAt: Date.now(), editedBy: user._id };
    if (name !== undefined) patch.name = requireBoundedText(name, "nombre", 1, 120);
    if (product !== undefined) patch.product = requireBoundedText(product, "producto", 1, 120);
    if (estimatedAmount !== undefined) patch.estimatedAmount = requireEstimatedAmount(estimatedAmount);
    if (newStage !== undefined) {
      if (!OPPORTUNITY_OPEN_STAGES.includes(newStage)) {
        throw new Error('Para cerrarla usa "Ganar" o "Marcar perdida", no un cambio de etapa directo.');
      }
      patch.stage = newStage;
    }
    if (expectedCloseDate !== undefined) patch.expectedCloseDate = requireExpectedCloseDate(expectedCloseDate);
    await ctx.db.patch(id, patch);
    return ctx.db.get(id);
  },
});

/** Cierra la oportunidad como perdida. Ganarla (con venta) es `opportunities.win`, ICS-101. */
export const markLost = mutation({
  args: { id: v.id("opportunities"), lossReason: lossReason },
  handler: async (ctx, { id, lossReason: reason }) => {
    const user = await requireVendedor(ctx);
    const opportunity = await ctx.db.get(id);
    if (!opportunity) throw new Error("Oportunidad no encontrada.");
    if (opportunity.ownerId !== user._id) {
      throw new Error("No puedes editar una oportunidad que no es tuya.");
    }
    if (!OPPORTUNITY_OPEN_STAGES.includes(opportunity.stage)) {
      throw new Error("Esta oportunidad ya está cerrada.");
    }
    if (!reason) throw new Error("Selecciona un motivo antes de marcar como perdida.");
    const now = Date.now();
    await ctx.db.patch(id, { stage: "perdida", lossReason: reason, closedAt: now, closedBy: user._id });
    await recordTimelineEvent(ctx, {
      prospectId: opportunity.prospectId,
      at: now,
      type: "oportunidad-perdida",
      actorId: user._id,
      opportunityId: id,
    });
    return ctx.db.get(id);
  },
});

/**
 * ICS-101 — gana la oportunidad: crea la venta y cierra la oportunidad EN LA
 * MISMA mutation (atómico; la OCC de Convex protege llamadas concurrentes).
 *
 * Invariante "1 venta por oportunidad" (B7) — un índice no la garantiza por
 * sí solo, se comprueba aquí dentro: rechaza si `opportunity.saleId` ya está
 * definido, y rechaza si `sales.by_opportunity` ya devuelve una fila (belt
 * and suspenders — cualquiera de los dos caminos detecta una 2ª venta).
 */
export const win = mutation({
  args: {
    id: v.id("opportunities"),
    amount: v.number(),
    product: v.optional(v.string()),
    closedDate: v.optional(v.string()),
  },
  handler: async (ctx, { id, amount, product, closedDate }) => {
    const opportunity = await ctx.db.get(id);
    if (!opportunity) throw new Error("Oportunidad no encontrada.");
    const { user } = await requireOwnedProspect(ctx, opportunity.prospectId);

    if (!OPPORTUNITY_OPEN_STAGES.includes(opportunity.stage)) {
      throw new Error("Esta oportunidad ya está cerrada.");
    }
    if (opportunity.saleId) {
      throw new Error("Esta oportunidad ya tiene una venta registrada.");
    }
    const existingSale = await ctx.db
      .query("sales")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", id))
      .first();
    if (existingSale) {
      throw new Error("Esta oportunidad ya tiene una venta registrada.");
    }

    if (!amount || amount <= 0) throw new Error("El monto debe ser mayor a 0.");
    const closedAt = resolveClosedAt(closedDate);
    const cleanProduct = product !== undefined ? requireBoundedText(product, "producto", 1, 120) : opportunity.product;

    const saleId = await ctx.db.insert("sales", {
      prospectId: opportunity.prospectId,
      amount,
      product: cleanProduct,
      closedAt,
      closedBy: user._id,
      ownerId: opportunity.ownerId,
      opportunityId: id,
    });
    await ctx.db.patch(id, { stage: "ganada", closedAt, closedBy: user._id, saleId });
    await recordTimelineEvent(ctx, {
      prospectId: opportunity.prospectId,
      at: closedAt,
      type: "oportunidad-ganada",
      actorId: user._id,
      opportunityId: id,
    });
    await recordTimelineEvent(ctx, {
      prospectId: opportunity.prospectId,
      at: closedAt,
      type: "venta",
      actorId: user._id,
      saleId,
    });
    return ctx.db.get(id);
  },
});

/**
 * Oportunidades de un prospecto: abiertas primero, luego cerradas por
 * `closedAt` desc. El número de oportunidades de UN prospecto es chico por
 * naturaleza (a diferencia del feed global de ICS-81) — a diferencia de
 * `prospects.get` (B5), este `.collect()` está acotado a una sola relación,
 * no a "todo lo que ha pasado en el CRM". Paginación manual (cursor =
 * offset) sobre esa lista ya ordenada, para conservar el contrato
 * `{page, isDone, continueCursor}` que usa `usePaginatedQuery` en el cliente.
 */
export const listByProspect = query({
  args: { prospectId: v.id("prospects"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { prospectId, paginationOpts }) => {
    await requireProspectRead(ctx, prospectId);
    const all = await ctx.db
      .query("opportunities")
      .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
      .collect();
    all.sort((a, b) => {
      const aOpen = OPPORTUNITY_OPEN_STAGES.includes(a.stage);
      const bOpen = OPPORTUNITY_OPEN_STAGES.includes(b.stage);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      if (aOpen) return b._creationTime - a._creationTime;
      return (b.closedAt ?? 0) - (a.closedAt ?? 0);
    });
    const offset = paginationOpts.cursor ? Number(paginationOpts.cursor) : 0;
    const page = all.slice(offset, offset + paginationOpts.numItems);
    const isDone = offset + page.length >= all.length;
    return { page, isDone, continueCursor: String(offset + page.length) };
  },
});

/**
 * `/ventas` — vista "Oportunidades". Un solo índice base por request, elegido
 * por el filtro principal (patrón ICS-81):
 *   - `prospectId`                           → `by_prospect_and_stage`
 *   - vendedor (o admin filtrando vendedor) + `stage` → `by_owner_and_stage` (ambos eq)
 *   - vendedor (o admin filtrando vendedor), sin `stage` → `by_owner_and_stage` (solo owner)
 *   - `stage` sin dueño (admin)               → `by_stage_and_expected`
 *   - ninguno (admin, todo)                   → orden por defecto (`_creationTime`)
 * `expectedFrom`/`expectedTo` se aplican siempre como predicado secundario
 * (ya vienen resueltos por el índice cuando este los cubre; si no, los filtra
 * `collectFilteredPage` sin devolver páginas vacías).
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filters: v.optional(
      v.object({
        ownerId: v.optional(v.id("users")),
        stage: v.optional(opportunityStage),
        prospectId: v.optional(v.id("prospects")),
        expectedFrom: v.optional(v.string()),
        expectedTo: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { paginationOpts, filters = {} }) => {
    const user = await requireAuthenticatedUser(ctx);
    const { stage: stageFilter, prospectId, expectedFrom, expectedTo } = filters;
    const scopedOwnerId = user.role === "vendedor" ? user._id : filters.ownerId;

    const withExpectedRange = (q) => {
      let r = q;
      if (expectedFrom !== undefined) r = r.gte("expectedCloseDate", expectedFrom);
      if (expectedTo !== undefined) r = r.lte("expectedCloseDate", expectedTo);
      return r;
    };

    let makeQuery;
    if (prospectId) {
      makeQuery = () =>
        ctx.db
          .query("opportunities")
          .withIndex("by_prospect_and_stage", (q) =>
            stageFilter !== undefined ? q.eq("prospectId", prospectId).eq("stage", stageFilter) : q.eq("prospectId", prospectId),
          )
          .order("desc");
    } else if (scopedOwnerId && stageFilter !== undefined) {
      makeQuery = () =>
        ctx.db
          .query("opportunities")
          .withIndex("by_owner_and_stage", (q) => q.eq("ownerId", scopedOwnerId).eq("stage", stageFilter))
          .order("desc");
    } else if (scopedOwnerId) {
      makeQuery = () =>
        ctx.db
          .query("opportunities")
          .withIndex("by_owner_and_stage", (q) => q.eq("ownerId", scopedOwnerId))
          .order("desc");
    } else if (stageFilter !== undefined) {
      makeQuery = () =>
        ctx.db
          .query("opportunities")
          .withIndex("by_stage_and_expected", (q) => withExpectedRange(q.eq("stage", stageFilter)))
          .order("desc");
    } else {
      makeQuery = () => ctx.db.query("opportunities").order("desc");
    }

    const predicate = (o) =>
      (expectedFrom === undefined || (o.expectedCloseDate ?? "") >= expectedFrom) &&
      (expectedTo === undefined || (o.expectedCloseDate ?? "9999-99-99") <= expectedTo);

    const result = await collectFilteredPage(makeQuery, paginationOpts, predicate);

    const prospectIds = new Set(result.page.map((o) => o.prospectId));
    const prospects = await hydrateByIds(ctx, prospectIds);

    return {
      ...result,
      page: result.page.map((o) => {
        const prospect = prospects.get(o.prospectId);
        return { ...o, prospectName: prospect?.name ?? null };
      }),
    };
  },
});
