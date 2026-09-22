import { internalMutation } from "./_generated/server";
import { recordTimelineEvent, startOfBusinessTodayMs } from "./lib";

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

/**
 * ICS-90 — datos de demo para el resto del milestone 6: interacciones y
 * seguimientos con variedad real, para que `/actividad`, el Dashboard, "Mi
 * desempeño" y Reportes tengan algo que enseñar (hoy en `dev` casi todo daba
 * cero). Mismo criterio que `seedVentasDemo`: NO es un smoke test, no se
 * autolimpia, prefijo "[DEMO ACTIVIDAD]" para poder borrarlo a mano después.
 *
 * Requiere al menos 1 vendedor; si hay 2 o más usa los dos primeros (por
 * antigüedad) para que el ranking "interacciones por vendedor" tenga
 * contenido real. Cubre a propósito: los 5 tipos de contacto, los 4
 * resultados (+ interacciones sin resultado), `source` manual y ausente,
 * cumplimiento de nota mixto (con y sin nota+próximo seguimiento), y
 * seguimientos en los 4 estados que le importan a ICS-87/89/90: pendiente a
 * futuro, vencido, completado a tiempo y completado tarde.
 *
 * Correr una vez:
 *   npx convex run seedDemo:seedActividadDemo
 */
export const seedActividadDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const vendedores = (await ctx.db.query("users").filter((q) => q.eq(q.field("role"), "vendedor")).collect()).sort(
      (a, b) => a._creationTime - b._creationTime,
    );
    if (vendedores.length === 0) {
      throw new Error("No hay ningún usuario vendedor en este deployment — crea uno primero.");
    }
    const vendorA = vendedores[0];
    const vendorB = vendedores[1] ?? vendedores[0];

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const todayCutoff = startOfBusinessTodayMs();

    async function makeProspect(name, ownerId, stage = "contactado") {
      return ctx.db.insert("prospects", {
        name: `[DEMO ACTIVIDAD] ${name}`,
        phone: "55 0000 0001",
        channel: "whatsapp",
        interest: "Datos de demo para actividad/dashboard/reportes",
        note: "Creado por seedDemo.seedActividadDemo.",
        stage,
        stageChangedAt: now,
        ownerId,
      });
    }

    async function addInteraction(prospectId, registeredBy, { type, note, outcome, source, at, nextFollowUpId }) {
      const interactionId = await ctx.db.insert("interactions", {
        prospectId,
        at,
        type,
        note,
        registeredBy,
        outcome,
        source,
        nextFollowUpId,
      });
      await recordTimelineEvent(ctx, { prospectId, at, type: "interaccion", actorId: registeredBy, interactionId });
      return interactionId;
    }

    async function addFollowUp(prospectId, ownerId, { at, type, status, completedAt, resolution }) {
      return ctx.db.insert("followUps", {
        prospectId,
        at,
        type,
        status,
        ownerId,
        completedAt,
        completedBy: completedAt ? ownerId : undefined,
        resolution,
      });
    }

    let interactions = 0;
    let followUps = 0;
    let prospects = 0;

    // 1) Vendor A — interacción con nota + próximo seguimiento (CUMPLE), tipo llamada, resultado positivo.
    {
      const prospectId = await makeProspect("Tlapalería Demo A1", vendorA._id);
      const followUpId = await addFollowUp(prospectId, vendorA._id, { at: now + 2 * DAY, type: "llamada", status: "pendiente" });
      await addInteraction(prospectId, vendorA._id, {
        type: "llamada", note: "Muy interesado, pidió cotización formal.", outcome: "positivo", source: "manual",
        at: now - DAY, nextFollowUpId: followUpId,
      });
      prospects++; interactions++; followUps++;
    }

    // 2) Vendor A — interacción SIN próximo seguimiento (NO cumple), whatsapp, sin resultado.
    {
      const prospectId = await makeProspect("Papelería Demo A2", vendorA._id, "nuevo");
      await addInteraction(prospectId, vendorA._id, {
        type: "whatsapp", note: "Primer contacto, todavía sin definir interés.", source: "manual", at: now - 3 * DAY,
      });
      prospects++; interactions++;
    }

    // 3) Vendor A — seguimiento VENCIDO (nunca se cerró), tipo visita.
    {
      const prospectId = await makeProspect("Ferretería Demo A3", vendorA._id);
      await addFollowUp(prospectId, vendorA._id, { at: todayCutoff - 4 * DAY, type: "visita", status: "pendiente" });
      followUps++; prospects++;
    }

    // 4) Vendor A — interacción de resultado negativo, email, con nota pero sin next follow-up (activo, así que en la práctica violaría ICS-16 — pero el seed inserta directo a la tabla sin pasar por la mutation, es intencional para tener un caso "no cumple" con nota presente).
    {
      const prospectId = await makeProspect("Refaccionaria Demo A4", vendorA._id, "cotizacion");
      await addInteraction(prospectId, vendorA._id, {
        type: "email", note: "Cotización enviada, sin respuesta después de una semana.", outcome: "negativo", source: "manual", at: now - 5 * DAY,
      });
      prospects++; interactions++;
    }

    // 5) Vendor A — seguimiento completado A TIEMPO (llamada de ayer, cerrado el mismo día).
    {
      const prospectId = await makeProspect("Consultorio Demo A5", vendorA._id, "negociacion");
      const at = now - 2 * DAY;
      await addFollowUp(prospectId, vendorA._id, { at, type: "otro", status: "completado", completedAt: at, resolution: "hecho" });
      followUps++; prospects++;
    }

    // 6) Vendor B — interacción con nota + próximo seguimiento (CUMPLE), whatsapp, resultado sin-respuesta.
    {
      const prospectId = await makeProspect("Cocina Demo B1", vendorB._id);
      const followUpId = await addFollowUp(prospectId, vendorB._id, { at: now + DAY, type: "whatsapp", status: "pendiente" });
      await addInteraction(prospectId, vendorB._id, {
        type: "whatsapp", note: "Mandé el catálogo, va a revisar con su socio.", outcome: "sin-respuesta", source: "manual",
        at: now - 12 * 60 * 60 * 1000, nextFollowUpId: followUpId,
      });
      prospects++; interactions++; followUps++;
    }

    // 7) Vendor B — interacción `source` AUSENTE (dato anterior a ICS-78 — debe contar como manual en cumplimientoNota), neutro, sin próximo seguimiento.
    {
      const prospectId = await makeProspect("Taller Demo B2", vendorB._id, "nuevo");
      await addInteraction(prospectId, vendorB._id, { type: "visita", note: "Pasó a preguntar precios.", outcome: "neutro", at: now - 4 * DAY });
      prospects++; interactions++;
    }

    // 8) Vendor B — seguimiento completado TARDE (programado hace 5 días, cerrado ayer).
    {
      const prospectId = await makeProspect("Mueblería Demo B3", vendorB._id, "cotizacion");
      const scheduledAt = now - 5 * DAY;
      const completedAt = now - DAY;
      await addFollowUp(prospectId, vendorB._id, { at: scheduledAt, type: "llamada", status: "completado", completedAt, resolution: "hecho" });
      followUps++; prospects++;
    }

    // 9) Vendor B — interacción tipo "otro", resultado positivo, sin nota de próximo seguimiento (activo — otro caso "no cumple").
    {
      const prospectId = await makeProspect("Boutique Demo B4", vendorB._id, "contactado");
      await addInteraction(prospectId, vendorB._id, {
        type: "otro", note: "Contacto por referido, quedó de llamar la próxima semana.", outcome: "positivo", source: "manual", at: now - 6 * 60 * 60 * 1000,
      });
      prospects++; interactions++;
    }

    return { prospects, interactions, followUps, vendorA: vendorA.name, vendorB: vendorB.name };
  },
});
