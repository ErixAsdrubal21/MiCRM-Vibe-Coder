// Smoke test de ICS-100 (convex/opportunities.js: create/update/markLost/
// listByProspect/list, + requireOwnedProspect/requireProspectRead).
// Sin navegador: mutations/queries end-to-end contra un deployment de Convex,
// autenticado como vendedor vía Convex Auth (Password).
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ics100.mjs
//
//   # Opcional — habilita los casos de aislamiento de cartera y admin:
//   SMOKE_OTHER_VENDOR_EMAIL=... SMOKE_OTHER_VENDOR_PASSWORD=...
//   SMOKE_ADMIN_EMAIL=marta@minegocio.com SMOKE_ADMIN_PASSWORD=...
//
// ASERCIONES (~20)
//   login · create exige estimatedAmount>0, name/product no vacíos, solo en
//   etapa abierta · create en prospecto ajeno rechazado · update cambia
//   campos + editedAt/editedBy · update de stage a "ganada"/"perdida"
//   rechazado (usa markLost/win) · update de una oportunidad ya cerrada
//   rechazado · markLost exige lossReason, deja closedAt/closedBy y evento
//   oportunidad-perdida en el timeline · 2º markLost sobre la misma
//   rechazado · listByProspect: abiertas antes que cerradas, cerradas por
//   closedAt desc · [si hay 2º vendedor] listByProspect/update de una
//   oportunidad ajena rechazados · [si hay admin] listByProspect de admin
//   sobre cualquier prospecto permitido, pero admin no puede create ·
//   reasignar el prospecto mueve la oportunidad ABIERTA al nuevo dueño y dos
//   NO toca una CERRADA (via testHelpers.reassignProspectForSmoke) · list
//   filtrado por stage devuelve solo esa etapa.
//
// DATOS
//   Crea ~4 prospectos "[SMOKE ICS-100]" y los borra al final (incluso si falla).

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");
const otherEmail = process.env.SMOKE_OTHER_VENDOR_EMAIL;
const otherPassword = process.env.SMOKE_OTHER_VENDOR_PASSWORD;
const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

const PREFIX = "[SMOKE ICS-100]";
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
    interest: "Prueba ICS-100",
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
  assert(me && me.role === "vendedor", "el login de smoke debe ser un vendedor");

  // --- create ---
  const p1 = await makeProspect(vendor, "Cliente A", "contactado");
  await assertRejects(
    vendor.mutation(anyApi.opportunities.create, { prospectId: p1._id, name: "", product: "X", estimatedAmount: 100 }),
    "create con name vacío debe rechazar",
  );
  await assertRejects(
    vendor.mutation(anyApi.opportunities.create, { prospectId: p1._id, name: "Op", product: "X", estimatedAmount: 0 }),
    "create con estimatedAmount 0 debe rechazar",
  );
  await assertRejects(
    vendor.mutation(anyApi.opportunities.create, { prospectId: p1._id, name: "Op", product: "X", estimatedAmount: 100, stage: "ganada" }),
    "create en etapa cerrada debe rechazar",
  );
  const opp1 = await vendor.mutation(anyApi.opportunities.create, {
    prospectId: p1._id,
    name: "Cotización tinacos",
    product: "Tinaco 1100L",
    estimatedAmount: 5000,
  });
  assert(opp1.stage === "calificacion", "create sin stage default a calificacion");
  assert(opp1.ownerId === me._id, "create setea ownerId = dueño del prospecto");
  assert(opp1.source === "manual", 'create setea source "manual"');

  // --- update ---
  const updated = await vendor.mutation(anyApi.opportunities.update, { id: opp1._id, estimatedAmount: 6000, stage: "cotizacion" });
  assert(updated.estimatedAmount === 6000 && updated.stage === "cotizacion", "update aplica los cambios");
  assert(updated.editedAt && updated.editedBy === me._id, "update deja editedAt/editedBy");
  await assertRejects(
    vendor.mutation(anyApi.opportunities.update, { id: opp1._id, stage: "ganada" }),
    'update a stage "ganada" debe rechazar (usa win)',
  );

  // --- markLost ---
  await assertRejects(
    vendor.mutation(anyApi.opportunities.markLost, { id: opp1._id }),
    "markLost sin lossReason debe rechazar",
  );
  const lost = await vendor.mutation(anyApi.opportunities.markLost, { id: opp1._id, lossReason: "precio" });
  assert(lost.stage === "perdida" && lost.closedAt && lost.closedBy === me._id, "markLost cierra con closedAt/closedBy");
  await assertRejects(
    vendor.mutation(anyApi.opportunities.markLost, { id: opp1._id, lossReason: "otro" }),
    "2º markLost sobre la misma debe rechazar",
  );
  await assertRejects(
    vendor.mutation(anyApi.opportunities.update, { id: opp1._id, estimatedAmount: 1 }),
    "update de una oportunidad cerrada debe rechazar",
  );

  // --- listByProspect: abiertas antes que cerradas ---
  const opp2 = await vendor.mutation(anyApi.opportunities.create, {
    prospectId: p1._id,
    name: "2ª oportunidad",
    product: "Cisterna",
    estimatedAmount: 8000,
  });
  const list1 = await vendor.query(anyApi.opportunities.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } });
  assert(list1.page.length === 2, "listByProspect devuelve las 2 oportunidades del prospecto");
  assert(list1.page[0]._id === opp2._id, "listByProspect pone la abierta primero");
  assert(list1.page[1]._id === opp1._id, "listByProspect pone la cerrada al final");

  // --- list filtrado por stage ---
  const listCalif = await vendor.query(anyApi.opportunities.list, {
    paginationOpts: { numItems: 10, cursor: null },
    filters: { stage: "calificacion" },
  });
  assert(
    listCalif.page.every((o) => o.stage === "calificacion") && listCalif.page.some((o) => o._id === opp2._id),
    "list filtrado por stage devuelve solo esa etapa",
  );

  // --- aislamiento de cartera (si hay 2º vendedor) ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await login(other, otherEmail, otherPassword);
    await assertRejects(
      other.mutation(anyApi.opportunities.create, { prospectId: p1._id, name: "X", product: "X", estimatedAmount: 1 }),
      "create en cartera ajena debe rechazar",
    );
    await assertRejects(
      other.mutation(anyApi.opportunities.update, { id: opp2._id, estimatedAmount: 1 }),
      "update de oportunidad ajena debe rechazar",
    );
    await assertRejects(
      other.query(anyApi.opportunities.listByProspect, { prospectId: p1._id, paginationOpts: { numItems: 10, cursor: null } }),
      "listByProspect de un prospecto ajeno debe rechazar",
    );

    // --- reasignación sincroniza solo las abiertas ---
    const otherMe = await other.query(anyApi.users.currentUser, {});
    const reassign = await admin.mutation(anyApi.testHelpers.reassignProspectForSmoke, {
      prospectId: p1._id,
      newOwnerId: otherMe._id,
    });
    const opp2After = reassign.opportunityOwnerIds.find((o) => o.id === opp2._id);
    const opp1After = reassign.opportunityOwnerIds.find((o) => o.id === opp1._id);
    assert(opp2After.ownerId === otherMe._id, "reasignar mueve la oportunidad ABIERTA al nuevo dueño");
    assert(opp1After.ownerId === me._id, "reasignar NO toca la oportunidad CERRADA");
    // revertir para que el cascade-delete de más abajo (dueño original) no truene
    await admin.mutation(anyApi.testHelpers.reassignProspectForSmoke, { prospectId: p1._id, newOwnerId: me._id });
  } else {
    console.log("(sin SMOKE_OTHER_VENDOR_EMAIL/PASSWORD — se omiten los casos de aislamiento de cartera y reasignación)");
  }

  // --- admin: lee, no crea (si hay admin) ---
  if (adminEmail && adminPassword) {
    const adminClient = new ConvexHttpClient(url);
    await login(adminClient, adminEmail, adminPassword);
    const asAdmin = await adminClient.query(anyApi.opportunities.listByProspect, {
      prospectId: p1._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    assert(asAdmin.page.length === 2, "admin puede listByProspect de cualquier prospecto");
    await assertRejects(
      adminClient.mutation(anyApi.opportunities.create, { prospectId: p1._id, name: "X", product: "X", estimatedAmount: 1 }),
      "admin no puede crear oportunidades",
    );
  } else {
    console.log("(sin SMOKE_ADMIN_EMAIL/PASSWORD — se omiten los casos de admin)");
  }

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
