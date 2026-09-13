import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireVendedor, requireAdministrador } from "./permissions";
import { isActiveStage, daysSince, lastContactAt } from "./lib";
import { LOSS_REASON_VALUES, OPPORTUNITY_OPEN_STAGES, OPPORTUNITY_STAGE_VALUES, STAGE_PROBABILITY } from "../shared/crmEnums.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = { semana: 7, mes: 30 };
const LOSS_REASONS = LOSS_REASON_VALUES;

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

/** Redondeado, 0 si `base` es 0 — única fuente de esta fórmula, reutilizada también por `statsFor`. */
function conversionRate(sold, base) {
  return base > 0 ? Math.round((sold / base) * 100) : 0;
}

function statsFor(ownedProspectIds, interactions, sales, start, end) {
  const atendidosIds = new Set(
    interactions
      .filter((i) => !i.deletedAt && i.at >= start && i.at < end && ownedProspectIds.has(i.prospectId))
      .map((i) => i.prospectId)
  );
  const atendidos = atendidosIds.size;
  // ICS-105: una venta anulada no cuenta como venta cerrada para conversión.
  const ventas = sales.filter((s) => !s.voidedAt && s.closedAt >= start && s.closedAt < end && ownedProspectIds.has(s.prospectId)).length;
  return { atendidos, ventas, tasaConversion: conversionRate(ventas, atendidos) };
}

/**
 * ICS-105 — bloque de oportunidades (pipeline/forecast/conversión/ticket),
 * compartido por `dashboard`, `myPerformance` y `reportes`. Deliberadamente
 * NO toca nada de actividad/cumplimiento de seguimiento (ICS-87/89, todavía
 * sin implementar) — es un bloque aditivo en los mismos archivos, no un
 * reemplazo; no debería chocar cuando esas dos issues se hagan después.
 *
 * `estimatedAmount` ausente ("monto pendiente", ICS-98 B1) se excluye del
 * valor de pipeline y del forecast, y se cuenta aparte en `pendingCount`.
 */
function pipelineStats(opportunities) {
  const open = opportunities.filter((o) => OPPORTUNITY_OPEN_STAGES.includes(o.stage));
  const withAmount = open.filter((o) => o.estimatedAmount != null);
  const pipelineValue = withAmount.reduce((sum, o) => sum + o.estimatedAmount, 0);
  const forecast = Math.round(withAmount.reduce((sum, o) => sum + o.estimatedAmount * (STAGE_PROBABILITY[o.stage] / 100), 0));
  return { pipelineValue, forecast, pendingCount: open.length - withAmount.length, openCount: open.length };
}

/** Ganadas / (ganadas + perdidas) CERRADAS en la ventana. Una ganada con venta anulada sigue contando ganada (B3, no depende de `sales` en absoluto). */
function opportunityConversion(opportunities, start, end) {
  const closed = opportunities.filter((o) => (o.stage === "ganada" || o.stage === "perdida") && o.closedAt != null && o.closedAt >= start && o.closedAt < end);
  const won = closed.filter((o) => o.stage === "ganada").length;
  return { won, lost: closed.length - won, rate: conversionRate(won, closed.length) };
}

/** Σ `amount` de ventas NO anuladas / nº de esas ventas, en la ventana. 0 si no hay ninguna (evita NaN). */
function avgTicket(sales, start, end) {
  const inRange = sales.filter((s) => !s.voidedAt && s.closedAt >= start && s.closedAt < end);
  if (inRange.length === 0) return 0;
  return Math.round(inRange.reduce((sum, s) => sum + s.amount, 0) / inRange.length);
}

function opportunityFunnel(opportunities) {
  return OPPORTUNITY_STAGE_VALUES.map((stage) => ({ stage, count: opportunities.filter((o) => o.stage === stage).length }));
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
    period: v.union(v.literal("semana"), v.literal("mes")),
  },
  handler: async (ctx, { period }) => {
    const user = await requireVendedor(ctx);
    const now = Date.now();
    const { currentStart, previousStart, previousEnd } = windowBounds(period, now);

    const [prospects, interactions, sales, opportunities] = await Promise.all([
      ctx.db.query("prospects").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect(),
      ctx.db
        .query("interactions")
        .withIndex("by_registeredBy", (q) => q.eq("registeredBy", user._id).gte("at", previousStart))
        .collect(),
      ctx.db
        .query("sales")
        .withIndex("by_closedBy", (q) => q.eq("closedBy", user._id).gte("closedAt", previousStart))
        .collect(),
      // ICS-105 — pipeline propio: todas las oportunidades de este vendedor
      // (abiertas para pipeline/forecast, cerradas para la conversión).
      ctx.db.query("opportunities").withIndex("by_owner_and_stage", (q) => q.eq("ownerId", user._id)).collect(),
    ]);
    const ownedProspectIds = new Set(prospects.map((p) => p._id));

    return {
      current: statsFor(ownedProspectIds, interactions, sales, currentStart, now + 1),
      previous: statsFor(ownedProspectIds, interactions, sales, previousStart, previousEnd),
      oportunidades: {
        ...pipelineStats(opportunities),
        conversion: {
          current: opportunityConversion(opportunities, currentStart, now + 1),
          previous: opportunityConversion(opportunities, previousStart, previousEnd),
        },
      },
    };
  },
});

/**
 * ICS-27 — cálculos agregados centralizados, compartidos por `dashboard` y
 * `reportes` (abajo) para que ambas pantallas den siempre el mismo número
 * para el mismo período. `conversionRate` (arriba) aquí se usa con
 * denominador "prospectos nuevos" del período — así lo describe el PRD ("de
 * cada 10 prospectos, cuántos terminaron en venta") — distinto del
 * denominador "atendidos" que usa `statsFor` para la métrica personal de un
 * vendedor; son preguntas de negocio distintas, no una inconsistencia.
 */
function todayBounds(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start: start.getTime(), end: start.getTime() + DAY_MS };
}

/**
 * Seguimientos agendados específicamente para hoy, ya acotados a los
 * prospectos de un vendedor (`ownedProspectIds`) — no vencidos de días
 * anteriores (esos ya los cubre la alerta de riesgo).
 */
function tasksToday(followUps, ownedProspectIds, now) {
  const { start, end } = todayBounds(now);
  const today = followUps.filter((f) => f.at >= start && f.at < end && ownedProspectIds.has(f.prospectId));
  const completadas = today.filter((f) => f.status === "completado").length;
  return { completadas, total: today.length };
}

/** `timestamp` cae dentro de [start, now] — rango rodante compartido por todos los filtros de período de abajo. */
function inWindow(timestamp, start, now) {
  return timestamp >= start && timestamp < now + 1;
}

/** Cuenta de prospectos activos con más de 3 días sin contacto — mismo criterio que el Tag de riesgo (ICS-20). */
async function countAtRisk(ctx, activeProspects) {
  const lastContacts = await Promise.all(activeProspects.map((p) => lastContactAt(ctx, p._id, p._creationTime)));
  return lastContacts.filter((lastAt) => daysSince(lastAt) > 3).length;
}

/**
 * Bloque "Carlos" del dashboard: su tasa de conversión de la semana + sus
 * tareas de hoy. Devuelve `carlos: null` si no hay exactamente un vendedor
 * (MVP de un solo vendedor, ver comentario de `dashboard` abajo).
 */
async function computeCarlosBlock(ctx, vendedores, prospects, followUps, week, now) {
  if (vendedores.length !== 1) {
    return { carlos: null, todayTasks: { completadas: 0, total: 0 } };
  }
  const vendedorId = vendedores[0]._id;
  const ownedProspectIds = new Set(prospects.filter((p) => p.ownerId === vendedorId).map((p) => p._id));
  const [interactions, vendorSales] = await Promise.all([
    ctx.db.query("interactions").withIndex("by_registeredBy", (q) => q.eq("registeredBy", vendedorId).gte("at", week.currentStart)).collect(),
    ctx.db.query("sales").withIndex("by_closedBy", (q) => q.eq("closedBy", vendedorId).gte("closedAt", week.currentStart)).collect(),
  ]);
  const stats = statsFor(ownedProspectIds, interactions, vendorSales, week.currentStart, now + 1);
  return {
    carlos: { name: vendedores[0].name, conversionThisWeek: stats.tasaConversion },
    todayTasks: tasksToday(followUps, ownedProspectIds, now),
  };
}

function groupByLossReason(lostProspects) {
  return LOSS_REASONS.map((reason) => ({
    reason,
    count: lostProspects.filter((p) => p.lossReason === reason).length,
  })).filter((r) => r.count > 0);
}

/**
 * ICS-23/24 Dashboard ejecutivo de Marta: los 6 bloques del PRD + la alerta
 * de riesgo (comparten el mismo dato `atRiskCount`, sin pantalla/query
 * propia para la alerta). El bloque `carlos` asume el MVP de un solo
 * vendedor: si no hay exactamente un usuario con rol "vendedor", se omite
 * (gestión de múltiples vendedores es ICS-29, fuera de este alcance).
 *
 * Gateado a Administrador: son métricas ejecutivas, no un simple "read"
 * neutral como `prospects.list`/`pipeline` (que ambos roles pueden ver) —
 * esta sí necesita `requireAdministrador`, igual que las mutations de
 * escritura ya validan `requireVendedor`.
 */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrador(ctx);
    const now = Date.now();
    const week = windowBounds("semana", now);
    const month = windowBounds("mes", now);

    const [prospects, sales, followUps, users, opportunities] = await Promise.all([
      ctx.db.query("prospects").collect(),
      ctx.db.query("sales").collect(),
      ctx.db.query("followUps").collect(),
      ctx.db.query("users").collect(),
      // ICS-105 — pipeline global. Un `.collect()` de toda la tabla, igual
      // que `prospects`/`sales` arriba: es un agregado ejecutivo de admin, no
      // un feed paginado (el CRM es de escala de un negocio pequeño).
      ctx.db.query("opportunities").collect(),
    ]);

    // ICS-105: una venta anulada no cuenta como ingreso — se excluye aquí,
    // una sola vez, antes de cualquier suma/conteo de `sales`.
    const activeSales = sales.filter((s) => !s.voidedAt);

    const active = prospects.filter((p) => isActiveStage(p.stage));
    const newThisMonth = prospects.filter((p) => inWindow(p._creationTime, month.currentStart, now)).length;
    const salesThisWeek = activeSales.filter((s) => inWindow(s.closedAt, week.currentStart, now)).length;
    const salesThisMonth = activeSales.filter((s) => inWindow(s.closedAt, month.currentStart, now)).length;
    const vendedores = users.filter((u) => u.role === "vendedor");

    const [atRiskCount, { carlos, todayTasks }] = await Promise.all([
      countAtRisk(ctx, active),
      computeCarlosBlock(ctx, vendedores, prospects, followUps, week, now),
    ]);

    return {
      activeCount: active.length,
      salesThisWeek,
      salesThisMonth,
      conversionThisMonth: conversionRate(salesThisMonth, newThisMonth),
      atRiskCount,
      tasksToday: todayTasks,
      carlos,
      oportunidades: {
        ...pipelineStats(opportunities),
        conversionThisMonth: opportunityConversion(opportunities, month.currentStart, now + 1).rate,
        avgTicketThisMonth: avgTicket(activeSales, month.currentStart, now + 1),
      },
    };
  },
});

/**
 * ICS-25/26 Reportes: bloques de ventas y pérdidas para el período elegido.
 * `detalle` en ambos bloques satisface "tocar el bloque lleva a un detalle
 * en lista" (la UI lo expande en la misma pantalla, sin ruta nueva — no hay
 * mockup confirmado para una pantalla de detalle separada). Gateado a
 * Administrador — mismo criterio que `dashboard`.
 */
export const reportes = query({
  args: { period: v.union(v.literal("semana"), v.literal("mes")) },
  handler: async (ctx, { period }) => {
    await requireAdministrador(ctx);
    const now = Date.now();
    const { currentStart } = windowBounds(period, now);

    const [prospects, sales, opportunities] = await Promise.all([
      ctx.db.query("prospects").collect(),
      ctx.db.query("sales").collect(),
      ctx.db.query("opportunities").collect(),
    ]);
    const nameById = new Map(prospects.map((p) => [p._id, p.name]));

    // ICS-105: una venta anulada no es ingreso — se excluye de "Ventas" antes
    // de cualquier suma/conteo (el detalle expandible tampoco la muestra).
    const activeSales = sales.filter((s) => !s.voidedAt);
    const nuevos = prospects.filter((p) => inWindow(p._creationTime, currentStart, now));
    const ventasPeriodo = activeSales.filter((s) => inWindow(s.closedAt, currentStart, now));
    const perdidosPeriodo = prospects.filter((p) => p.stage === "perdido" && inWindow(p.stageChangedAt, currentStart, now));

    return {
      ventas: {
        nuevos: nuevos.length,
        cerradas: ventasPeriodo.length,
        valorTotal: ventasPeriodo.reduce((sum, s) => sum + s.amount, 0),
        conversion: conversionRate(ventasPeriodo.length, nuevos.length),
        detalle: ventasPeriodo
          .map((s) => ({ prospectId: s.prospectId, name: nameById.get(s.prospectId) ?? "Prospecto eliminado", amount: s.amount, product: s.product, closedAt: s.closedAt }))
          .sort((a, b) => b.closedAt - a.closedAt),
      },
      perdidas: {
        total: perdidosPeriodo.length,
        porMotivo: groupByLossReason(perdidosPeriodo),
        detalle: perdidosPeriodo
          .map((p) => ({ prospectId: p._id, name: p.name, reason: p.lossReason, at: p.stageChangedAt }))
          .sort((a, b) => b.at - a.at),
      },
      // ICS-105 — bloque de oportunidades. El embudo (`funnel`) es una foto
      // del estado actual, no del período (no tiene sentido "el embudo de la
      // semana pasada"); conversión/ticket sí están acotados al período.
      oportunidades: {
        ...pipelineStats(opportunities),
        funnel: opportunityFunnel(opportunities),
        conversion: opportunityConversion(opportunities, currentStart, now + 1),
        avgTicket: avgTicket(activeSales, currentStart, now + 1),
      },
    };
  },
});
