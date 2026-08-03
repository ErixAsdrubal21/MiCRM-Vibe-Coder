import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireVendedor } from "./permissions";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = { semana: 7, mes: 30 };

/**
 * Ventanas rodantes (no calendario) — consistente con `daysSince`/
 * `daysSinceContact`, ya rodantes en todo el código. "Anterior" es el mismo
 * tamaño de ventana, inmediatamente antes de la actual.
 */
function windowBounds(period, now) {
  const spanMs = PERIOD_DAYS[period] * DAY_MS;
  return {
    currentStart: now - spanMs,
    previousStart: now - 2 * spanMs,
    previousEnd: now - spanMs,
  };
}

function statsFor(ownedProspectIds, interactions, sales, start, end) {
  const atendidosIds = new Set(
    interactions
      .filter((i) => i.at >= start && i.at < end && ownedProspectIds.has(i.prospectId))
      .map((i) => i.prospectId)
  );
  const atendidos = atendidosIds.size;
  const ventas = sales.filter((s) => s.closedAt >= start && s.closedAt < end && ownedProspectIds.has(s.prospectId)).length;
  const tasaConversion = atendidos > 0 ? Math.round((ventas / atendidos) * 100) : 0;
  return { atendidos, ventas, tasaConversion };
}

/**
 * ICS-22 "Mi desempeño": prospectos atendidos = prospectos propios del
 * vendedor con al menos una interacción registrada por él en el período.
 * Ventas cerradas = filas de `sales` de prospectos propios que él cerró en
 * el período (mismo filtro de "propio" que atendidos, para que la tasa de
 * conversión no mezcle ventas de prospectos ajenos). Tasa de conversión =
 * ventas ÷ atendidos del mismo período. Se calcula igual para el período
 * anterior equivalente, para la comparación que pide ICS-22.
 *
 * `interactions`/`sales` se leen acotados por índice (`by_registeredBy`,
 * `by_closedBy`) a la actividad de este vendedor desde el inicio del período
 * anterior — el costo escala con la actividad de Carlos, no con el tamaño
 * total del CRM.
 */
export const myPerformance = query({
  args: {
    actorId: v.id("users"),
    period: v.union(v.literal("semana"), v.literal("mes")),
  },
  handler: async (ctx, { actorId, period }) => {
    await requireVendedor(ctx, actorId);
    const now = Date.now();
    const { currentStart, previousStart, previousEnd } = windowBounds(period, now);

    const [prospects, interactions, sales] = await Promise.all([
      ctx.db.query("prospects").withIndex("by_owner", (q) => q.eq("ownerId", actorId)).collect(),
      ctx.db
        .query("interactions")
        .withIndex("by_registeredBy", (q) => q.eq("registeredBy", actorId).gte("at", previousStart))
        .collect(),
      ctx.db
        .query("sales")
        .withIndex("by_closedBy", (q) => q.eq("closedBy", actorId).gte("closedAt", previousStart))
        .collect(),
    ]);
    const ownedProspectIds = new Set(prospects.map((p) => p._id));

    return {
      current: statsFor(ownedProspectIds, interactions, sales, currentStart, now + 1),
      previous: statsFor(ownedProspectIds, interactions, sales, previousStart, previousEnd),
    };
  },
});
