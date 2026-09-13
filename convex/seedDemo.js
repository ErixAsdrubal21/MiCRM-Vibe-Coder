import { internalMutation } from "./_generated/server";
import { recordTimelineEvent } from "./lib";

/**
 * ICS-107 — datos de demo para `/ventas`: puebla el deployment (dev, o el
 * que se le apunte) con oportunidades en varias etapas (incluida "monto
 * pendiente") y ventas (algunas anuladas), para que la pantalla no se vea
 * vacía al enseñarla. NO es un smoke test — a diferencia de
 * `testHelpers.js`, esto está pensado para quedarse (no se autolimpia).
 * Prefijo "[DEMO VENTAS]" para poder identificarlo/borrarlo a mano después
 * con `testHelpers.deleteProspectCascade`.
 *
 * Requiere que ya exista al menos un usuario vendedor en el deployment
 * (usa el primero que encuentra) — no crea usuarios.
 *
 * Correr una vez:
 *   npx convex run seedDemo:seedVentasDemo
 */
export const seedVentasDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const vendor = await ctx.db.query("users").filter((q) => q.eq(q.field("role"), "vendedor")).first();
    if (!vendor) {
      throw new Error("No hay ningún usuario vendedor en este deployment — crea uno primero.");
    }
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    async function makeProspect(name, stage) {
      const prospectId = await ctx.db.insert("prospects", {
        name: `[DEMO VENTAS] ${name}`,
        phone: "55 0000 0000",
        channel: "whatsapp",
        interest: "Datos de demo para /ventas",
        note: "Creado por seedDemo.seedVentasDemo.",
        stage,
        stageChangedAt: now,
        ownerId: vendor._id,
      });
      return prospectId;
    }

    const created = { prospects: 0, opportunities: 0, sales: 0 };

    // 1) Oportunidad en calificación, con monto.
    {
      const prospectId = await makeProspect("Ferretería Demo 1", "contactado");
      await ctx.db.insert("opportunities", {
        prospectId, ownerId: vendor._id, name: "Cotización tinacos", product: "Tinaco 1100L",
        estimatedAmount: 8500, stage: "calificacion", source: "manual",
      });
      created.prospects++; created.opportunities++;
    }

    // 2) Oportunidad en cotización, SIN monto ("monto pendiente").
    {
      const prospectId = await makeProspect("Rosticería Demo 2", "cotizacion");
      await ctx.db.insert("opportunities", {
        prospectId, ownerId: vendor._id, name: "Equipo para cocina", product: "Estufa industrial",
        stage: "cotizacion", source: "manual",
        // estimatedAmount ausente a propósito.
      });
      created.prospects++; created.opportunities++;
    }

    // 3) Oportunidad en negociación, con fecha esperada.
    {
      const prospectId = await makeProspect("Taller Demo 3", "negociacion");
      await ctx.db.insert("opportunities", {
        prospectId, ownerId: vendor._id, name: "Refacciones trimestrales", product: "Kit de refacciones",
        estimatedAmount: 15000, stage: "negociacion", expectedCloseDate: "2026-10-15", source: "manual",
      });
      created.prospects++; created.opportunities++;
    }

    // 4) Oportunidad ganada + su venta vigente.
    {
      const prospectId = await makeProspect("Papelería Demo 4", "ganado");
      const closedAt = now - 3 * DAY;
      const saleId = await ctx.db.insert("sales", {
        prospectId, amount: 6200, product: "Mobiliario escolar", closedAt, closedBy: vendor._id, ownerId: vendor._id,
      });
      const opportunityId = await ctx.db.insert("opportunities", {
        prospectId, ownerId: vendor._id, name: "Mobiliario escolar", product: "Mobiliario escolar",
        estimatedAmount: 6200, stage: "ganada", closedAt, closedBy: vendor._id, saleId, source: "manual",
      });
      await ctx.db.patch(saleId, { opportunityId });
      await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "oportunidad-ganada", actorId: vendor._id, opportunityId });
      await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "venta", actorId: vendor._id, saleId });
      created.prospects++; created.opportunities++; created.sales++;
    }

    // 5) Oportunidad ganada, pero su venta fue ANULADA (B3: sigue "ganada").
    {
      const prospectId = await makeProspect("Cocina Económica Demo 5", "ganado");
      const closedAt = now - 6 * DAY;
      const saleId = await ctx.db.insert("sales", {
        prospectId, amount: 15600, product: "Equipo de cocina", closedAt, closedBy: vendor._id, ownerId: vendor._id,
        voidedAt: now - DAY, voidedBy: vendor._id, voidReason: "Monto registrado por error (dato de demo).",
      });
      const opportunityId = await ctx.db.insert("opportunities", {
        prospectId, ownerId: vendor._id, name: "Equipo de cocina", product: "Equipo de cocina",
        estimatedAmount: 15600, stage: "ganada", closedAt, closedBy: vendor._id, saleId, source: "manual",
      });
      await ctx.db.patch(saleId, { opportunityId });
      await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "oportunidad-ganada", actorId: vendor._id, opportunityId });
      await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "venta", actorId: vendor._id, saleId });
      await recordTimelineEvent(ctx, { prospectId, at: now - DAY, type: "venta-anulada", actorId: vendor._id, saleId });
      created.prospects++; created.opportunities++; created.sales++;
    }

    // 6) Oportunidad perdida.
    {
      const prospectId = await makeProspect("Consultorio Demo 6", "perdido");
      const closedAt = now - 2 * DAY;
      await ctx.db.patch(prospectId, { lossReason: "precio" });
      const opportunityId = await ctx.db.insert("opportunities", {
        prospectId, ownerId: vendor._id, name: "Equipo de consultorio", product: "Sillón dental",
        estimatedAmount: 22000, stage: "perdida", lossReason: "precio", closedAt, closedBy: vendor._id, source: "manual",
      });
      await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "oportunidad-perdida", actorId: vendor._id, opportunityId });
      created.prospects++; created.opportunities++;
    }

    // 7) Venta directa, sin oportunidad de origen.
    {
      const prospectId = await makeProspect("Ferretería 3 Hermanos Demo 7", "ganado");
      const closedAt = now - DAY;
      const saleId = await ctx.db.insert("sales", {
        prospectId, amount: 8200, product: "Tinacos 750L (x2)", closedAt, closedBy: vendor._id, ownerId: vendor._id,
      });
      await recordTimelineEvent(ctx, { prospectId, at: closedAt, type: "venta", actorId: vendor._id, saleId });
      created.prospects++; created.sales++;
    }

    return created;
  },
});
