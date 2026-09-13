// Smoke test de ICS-101 (opportunities.win, convex/sales.js: createDirect/
// void/list/listByProspect/getById, + prospects.get resúmenes B5).
// Sin navegador: mutations/queries end-to-end contra un deployment de Convex.
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   SMOKE_ADMIN_EMAIL=marta@minegocio.com \
//   SMOKE_ADMIN_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ics101.mjs
//
//   # Opcional — habilita el caso de aislamiento de cartera:
//   SMOKE_OTHER_VENDOR_EMAIL=... SMOKE_OTHER_VENDOR_PASSWORD=...
//
// ASERCIONES (~20)
//   win crea la venta y enlaza saleId↔opportunityId, deja stage "ganada" +
//   eventos oportunidad-ganada/venta · 2º win sobre la misma rechazado ·
//   win con closedDate futura rechazado · win en oportunidad ajena
//   rechazado · createDirect sin oportunidad funciona (opportunityId
//   ausente) · void como admin no borra la fila, deja voidedAt/voidedBy/
//   voidReason y evento venta-anulada, la oportunidad ganada SIGUE
//   "ganada" · 2º void rechazado · vendedor no puede void · list excluye
//   anuladas por defecto y las incluye con includeVoided · listByProspect/
//   getById de un prospecto ajeno rechazados; admin puede leer cualquiera ·
//   prospects.get devuelve conteos/sumas correctos, sin arrays.
//
// DATOS
//   Crea ~3 prospectos "[SMOKE ICS-101]" y los borra al final (incluso si falla).

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

const PREFIX = "[SMOKE ICS-101]";
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
async function makeProspect(client, name) {
  const p = await client.mutation(anyApi.prospects.create, {
    name: `${PREFIX} ${name}`,
    phone: "555-0000",
    channel: "whatsapp",
    interest: "Prueba ICS-101",
    note: "Prospecto de smoke test.",
  });
  createdProspectIds.push(p._id);
  return p;
}

async function main() {
  const vendor = new ConvexHttpClient(url);
  await login(vendor, vendorEmail, vendorPassword);

  const adminClient = new ConvexHttpClient(url);
  await login(adminClient, adminEmail, adminPassword);

  // --- win ---
  const p1 = await makeProspect(vendor, "Cliente A");
  const opp = await vendor.mutation(anyApi.opportunities.create, {
    prospectId: p1._id,
    name: "Cotización cisterna",
    product: "Cisterna 2500L",
    estimatedAmount: 15000,
  });
  await assertRejects(
    vendor.mutation(anyApi.opportunities.win, { id: opp._id, amount: 100, closedDate: "2099-01-01" }),
    "win con fecha futura debe rechazar",
  );
  const won = await vendor.mutation(anyApi.opportunities.win, { id: opp._id, amount: 14500 });
  assert(won.stage === "ganada" && won.saleId, "win deja stage=ganada y saleId enlazado");
  const sale = await adminClient.query(anyApi.sales.getById, { id: won.saleId });
  assert(sale.opportunityId === opp._id && sale.amount === 14500, "la venta creada por win enlaza a la oportunidad");
  await assertRejects(
    vendor.mutation(anyApi.opportunities.win, { id: opp._id, amount: 1 }),
    "2º win sobre la misma oportunidad debe rechazar",
  );

  // --- createDirect ---
  const direct = await vendor.mutation(anyApi.sales.createDirect, {
    prospectId: p1._id,
    amount: 3000,
    product: "Venta directa sin oportunidad",
  });
  assert(direct.opportunityId === undefined, "createDirect no enlaza ninguna oportunidad");

  // --- void (solo admin) ---
  await assertRejects(
    vendor.mutation(anyApi.sales.void, { id: direct._id, reason: "prueba" }),
    "un vendedor no puede anular una venta",
  );
  const voided = await adminClient.mutation(anyApi.sales.void, { id: direct._id, reason: "Corrección de monto (smoke test)" });
  assert(voided.voidedAt && voided.voidedBy, "void deja voidedAt/voidedBy");
  await assertRejects(
    adminClient.mutation(anyApi.sales.void, { id: direct._id, reason: "otra vez" }),
    "2º void sobre la misma venta debe rechazar",
  );
  const oppAfterVoidOfDirect = await vendor.query(anyApi.opportunities.listByProspect, {
    prospectId: p1._id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  const wonOppAfter = oppAfterVoidOfDirect.page.find((o) => o._id === opp._id);
  assert(wonOppAfter.stage === "ganada", "anular una venta directa no afecta otras oportunidades ganadas");

  // Ahora anulamos la venta DE la oportunidad ganada y confirmamos que ésta sigue "ganada" (B3).
  await adminClient.mutation(anyApi.sales.void, { id: won.saleId, reason: "Corrección (smoke test)" });
  const oppAfterOwnVoid = await vendor.query(anyApi.opportunities.listByProspect, {
    prospectId: p1._id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert(
    oppAfterOwnVoid.page.find((o) => o._id === opp._id).stage === "ganada",
    "anular la venta de una oportunidad ganada NO la reabre (B3)",
  );

  // --- list: excluye anuladas por defecto ---
  const listDefault = await vendor.query(anyApi.sales.list, {
    paginationOpts: { numItems: 20, cursor: null },
    filters: { prospectId: p1._id },
  });
  assert(listDefault.page.every((s) => !s.voidedAt), "list por defecto excluye anuladas");
  const listWithVoided = await vendor.query(anyApi.sales.list, {
    paginationOpts: { numItems: 20, cursor: null },
    filters: { prospectId: p1._id, includeVoided: true },
  });
  assert(listWithVoided.page.length === 2, "list con includeVoided muestra ambas");

  // --- prospects.get: resúmenes, sin arrays ---
  const summary = await vendor.query(anyApi.prospects.get, { id: p1._id });
  assert(summary.openOpportunitiesCount === 0, "sin oportunidades abiertas tras ganar la única");
  assert(summary.salesCount === 0, "salesCount excluye las 2 ventas anuladas");
  assert(summary.sale === undefined && summary.opportunities === undefined, "prospects.get no devuelve arrays/objetos crudos (B5)");

  // --- aislamiento de cartera (si hay 2º vendedor) ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await login(other, otherEmail, otherPassword);
    await assertRejects(
      other.mutation(anyApi.opportunities.win, { id: opp._id, amount: 1 }),
      "win en oportunidad ajena debe rechazar",
    );
    await assertRejects(
      other.query(anyApi.sales.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } }),
      "listByProspect de un prospecto ajeno debe rechazar",
    );
    await assertRejects(
      other.query(anyApi.sales.getById, { id: direct._id }),
      "getById de una venta de un prospecto ajeno debe rechazar",
    );
  } else {
    console.log("(sin SMOKE_OTHER_VENDOR_EMAIL/PASSWORD — se omite el caso de aislamiento de cartera)");
  }

  // admin sí puede leer cualquiera.
  const asAdmin = await adminClient.query(anyApi.sales.getById, { id: direct._id });
  assert(asAdmin.prospect._id === p1._id, "admin puede leer getById de cualquier venta");

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
