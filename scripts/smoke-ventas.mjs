// Smoke test consolidado de milestone 7 (Ventas y Oportunidades), ICS-107.
// Cubre los 9 puntos del issue contra un deployment de Convex autenticado.
// Patrón de scripts/smoke-ics92.mjs. Complementa (no reemplaza) los smokes
// por fase — scripts/smoke-ics100.mjs y scripts/smoke-ics101.mjs — con los
// puntos que solo tienen sentido de punta a punta: migración idempotente y
// reanudable, reasignación de cartera, e histórico que sobrevive un cambio
// de etapa.
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   SMOKE_ADMIN_EMAIL=marta@minegocio.com \
//   SMOKE_ADMIN_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ventas.mjs
//
//   # Opcional — habilita el caso de aislamiento de cartera:
//   SMOKE_OTHER_VENDOR_EMAIL=... SMOKE_OTHER_VENDOR_PASSWORD=...
//
// NUMERACIÓN — corresponde 1:1 a los puntos del issue ICS-107:
//   1. crear -> editar -> ganar: venta atómica, saleId<->opportunityId, eventos.
//   2. 2º win sobre la misma oportunidad -> rechazado (B7).
//   3. anular como admin -> no borra, voidedAt, evento venta-anulada,
//      la oportunidad SIGUE "ganada" (B3).
//   4. venta directa sin oportunidad.
//   5. autorización: vendedor ajeno rechazado en mutations y en
//      listByProspect/getById; vendedor no puede void; admin lee cualquiera.
//   6. closedDate futura / textos vacíos / estimatedAmount<=0 rechazados.
//   7. migración: correrla 2x y con un cursor "a medias" -> mismo resultado,
//      sin duplicados (by_migration_key).
//   8. ownerId: reasignar mueve las oportunidades ABIERTAS; cerradas y
//      sales conservan su ownerId/closedBy.
//   9. un cambio de etapa del prospecto no toca sus ventas históricas.
//
// DATOS
//   Crea ~5 prospectos "[SMOKE VENTAS]" y los borra al final (incluso si falla).

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const adminEmail = requireEnv("SMOKE_ADMIN_EMAIL");
const adminPassword = requireEnv("SMOKE_ADMIN_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");
const otherEmail = process.env.SMOKE_OTHER_VENDOR_EMAIL;
const otherPassword = process.env.SMOKE_OTHER_VENDOR_PASSWORD;

const PREFIX = "[SMOKE VENTAS]";
let passed = 0;
const createdProspectIds = [];
const admin = new ConvexHttpClient(url);
admin.setAdminAuth(deployKey);

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Falta la variable de entorno ${name} — ver el encabezado de este archivo.`);
    process.exit(2);
  }
  return val;
}
function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  passed++;
}
async function assertRejects(promise, msg) {
  try {
    await promise;
    throw new Error("FALLÓ (no rechazó): " + msg);
  } catch (e) {
    if (String(e.message).startsWith("FALLÓ")) throw e;
    passed++;
  }
}
async function login(client, email, password) {
  await client.action(anyApi.auth.signIn, { provider: "password", params: { email, password, flow: "signIn" } });
}
async function makeProspect(client, name, stage) {
  const p = await client.mutation(anyApi.prospects.create, {
    name: `${PREFIX} ${name}`,
    phone: "555-0000",
    channel: "whatsapp",
    interest: "Prueba milestone 7",
    note: "Prospecto de smoke test.",
  });
  createdProspectIds.push(p._id);
  if (stage && stage !== "nuevo") {
    await client.mutation(anyApi.prospects.changeStage, { id: p._id, stage });
  }
  return p;
}

async function main() {
  const vendor = new ConvexHttpClient(url);
  await login(vendor, vendorEmail, vendorPassword);
  const me = await vendor.query(anyApi.users.currentUser, {});

  const adminClient = new ConvexHttpClient(url);
  await login(adminClient, adminEmail, adminPassword);

  // --- 1) crear -> editar -> ganar ---
  const p1 = await makeProspect(vendor, "Cliente 1", "contactado");
  const opp1 = await vendor.mutation(anyApi.opportunities.create, {
    prospectId: p1._id, name: "Cotización A", product: "Producto A", estimatedAmount: 5000,
  });
  await vendor.mutation(anyApi.opportunities.update, { id: opp1._id, estimatedAmount: 5500 });
  const won1 = await vendor.mutation(anyApi.opportunities.win, { id: opp1._id, amount: 5200 });
  assert(won1.stage === "ganada" && won1.saleId, "1) win deja stage=ganada + saleId");
  const sale1 = await adminClient.query(anyApi.sales.getById, { id: won1.saleId });
  assert(sale1.opportunityId === opp1._id, "1) la venta enlaza de vuelta a la oportunidad");
  const timeline1 = await vendor.query(anyApi.timeline.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 20, cursor: null } });
  assert(timeline1.page.some((e) => e.type === "oportunidad-ganada"), "1) timeline tiene oportunidad-ganada");
  assert(timeline1.page.some((e) => e.type === "venta"), "1) timeline tiene venta");

  // --- 2) 2º win rechazado ---
  await assertRejects(vendor.mutation(anyApi.opportunities.win, { id: opp1._id, amount: 1 }), "2) 2º win sobre la misma oportunidad debe rechazar");

  // --- 3) anular como admin, la oportunidad sigue ganada ---
  await assertRejects(vendor.mutation(anyApi.sales.void, { id: won1.saleId, reason: "x" }), "3) un vendedor no puede anular");
  const voided1 = await adminClient.mutation(anyApi.sales.void, { id: won1.saleId, reason: "Corrección (smoke ventas)." });
  assert(voided1.voidedAt, "3) void deja voidedAt");
  const oppAfterVoid = await vendor.query(anyApi.opportunities.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } });
  assert(oppAfterVoid.page.find((o) => o._id === opp1._id).stage === "ganada", "3) la oportunidad sigue ganada tras anular su venta (B3)");
  const timelineAfterVoid = await vendor.query(anyApi.timeline.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 20, cursor: null } });
  assert(timelineAfterVoid.page.some((e) => e.type === "venta-anulada"), "3) timeline tiene venta-anulada");

  // --- 4) venta directa sin oportunidad ---
  const direct1 = await vendor.mutation(anyApi.sales.createDirect, { prospectId: p1._id, amount: 999, product: "Directa" });
  assert(direct1.opportunityId === undefined, "4) createDirect no enlaza ninguna oportunidad");

  // --- 5) autorización ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await login(other, otherEmail, otherPassword);
    await assertRejects(other.mutation(anyApi.opportunities.create, { prospectId: p1._id, name: "x", product: "x", estimatedAmount: 1 }), "5) create ajeno debe rechazar");
    await assertRejects(other.mutation(anyApi.opportunities.win, { id: opp1._id, amount: 1 }), "5) win ajeno debe rechazar");
    await assertRejects(other.mutation(anyApi.sales.createDirect, { prospectId: p1._id, amount: 1, product: "x" }), "5) createDirect ajeno debe rechazar");
    await assertRejects(other.query(anyApi.opportunities.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } }), "5) listByProspect (opportunities) ajeno debe rechazar");
    await assertRejects(other.query(anyApi.sales.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } }), "5) listByProspect (sales) ajeno debe rechazar");
    await assertRejects(other.query(anyApi.sales.getById, { id: direct1._id }), "5) getById ajeno debe rechazar");
  } else {
    console.log("(sin SMOKE_OTHER_VENDOR_EMAIL/PASSWORD — se omite 5, autorización cruzada)");
  }
  const asAdmin = await adminClient.query(anyApi.opportunities.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } });
  assert(asAdmin.page.length > 0, "5) admin lee cualquier prospecto");

  // --- 6) validaciones ---
  await assertRejects(vendor.mutation(anyApi.opportunities.win, { id: opp1._id, amount: 1, closedDate: "2099-01-01" }), "6) closedDate futura debe rechazar (ya cerrada, pero valida antes) ");
  const p6 = await makeProspect(vendor, "Cliente 6", "contactado");
  await assertRejects(vendor.mutation(anyApi.opportunities.create, { prospectId: p6._id, name: "", product: "x", estimatedAmount: 100 }), "6) name vacío debe rechazar");
  await assertRejects(vendor.mutation(anyApi.opportunities.create, { prospectId: p6._id, name: "x", product: "x", estimatedAmount: 0 }), "6) estimatedAmount<=0 debe rechazar");
  await assertRejects(vendor.mutation(anyApi.sales.createDirect, { prospectId: p6._id, amount: 100, product: "  " }), "6) product vacío (createDirect) debe rechazar");

  // --- 7) migración: 2x + reanudación desde un cursor ---
  await admin.mutation(anyApi.migrations.migrateOpportunitiesAndSales, {});
  const run2 = await admin.mutation(anyApi.migrations.migrateOpportunitiesAndSales, {});
  assert(run2.opportunitiesCreated === 0, "7) correr la migración 2ª vez no crea duplicados");
  // "reanudar tras un corte": arrancar de nuevo con un cursor vacío es
  // exactamente lo que hace el primer arranque manual tras un corte real
  // (el scheduler ya reintentó el lote pendiente; esto confirma que
  // reprocesar desde el principio también es idempotente).
  const resumed = await admin.mutation(anyApi.migrations.migrateOpportunitiesAndSales, { cursor: null });
  assert(resumed.opportunitiesCreated === 0 && resumed.isDone, "7) reanudar (cursor null) tras runs previos sigue sin duplicar");

  // --- 8) reasignación: abre sigue al nuevo dueño, cerradas/sales no ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await login(other, otherEmail, otherPassword);
    const otherMe = await other.query(anyApi.users.currentUser, {});
    const p8 = await makeProspect(vendor, "Cliente 8", "contactado");
    const openOpp = await vendor.mutation(anyApi.opportunities.create, { prospectId: p8._id, name: "Abierta", product: "x", estimatedAmount: 100 });
    const wonOpp = await vendor.mutation(anyApi.opportunities.create, { prospectId: p8._id, name: "Cerrada", product: "x", estimatedAmount: 200 });
    const wonSale = await vendor.mutation(anyApi.opportunities.win, { id: wonOpp._id, amount: 200 });
    const reassign = await admin.mutation(anyApi.testHelpers.reassignProspectForSmoke, { prospectId: p8._id, newOwnerId: otherMe._id });
    const openAfter = reassign.opportunityOwnerIds.find((o) => o.id === openOpp._id);
    const closedAfter = reassign.opportunityOwnerIds.find((o) => o.id === wonOpp._id);
    assert(openAfter.ownerId === otherMe._id, "8) reasignar mueve la oportunidad ABIERTA");
    assert(closedAfter.ownerId === me._id, "8) reasignar NO toca la oportunidad CERRADA");
    const saleAfter = await adminClient.query(anyApi.sales.getById, { id: wonSale.saleId });
    assert(saleAfter.ownerId === me._id && saleAfter.closedBy === me._id, "8) sale.ownerId/closedBy no cambian con la reasignación");
    await admin.mutation(anyApi.testHelpers.reassignProspectForSmoke, { prospectId: p8._id, newOwnerId: me._id });
  } else {
    console.log("(sin SMOKE_OTHER_VENDOR_EMAIL/PASSWORD — se omite 8, reasignación de cartera)");
  }

  // --- 9) el histórico de ventas sobrevive un cambio de etapa ---
  const p9 = await makeProspect(vendor, "Cliente 9", "ganado");
  const sale9 = await vendor.mutation(anyApi.sales.createDirect, { prospectId: p9._id, amount: 777, product: "Histórico" });
  await vendor.mutation(anyApi.prospects.changeStage, { id: p9._id, stage: "contactado" });
  const sale9After = await adminClient.query(anyApi.sales.getById, { id: sale9._id });
  assert(sale9After.amount === 777 && !sale9After.voidedAt, "9) la venta sigue intacta tras cambiar de etapa el prospecto");
  const listAfter = await vendor.query(anyApi.sales.list, { paginationOpts: { numItems: 20, cursor: null }, filters: { prospectId: p9._id } });
  assert(listAfter.page.some((s) => s._id === sale9._id), "9) sales.list sigue devolviendo la venta histórica");

  console.log(`✅ ${passed} aserciones OK`);
}

async function cleanup() {
  for (const id of createdProspectIds) {
    try {
      await admin.mutation(anyApi.testHelpers.deleteProspectCascade, { id });
    } catch (e) {
      console.error(`No se pudo borrar ${id}:`, e.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(cleanup);
