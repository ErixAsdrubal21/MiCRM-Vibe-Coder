// Smoke test de ICS-81 (interactions.feed + followUps.list + prospects.search).
// Sin navegador: queries paginadas end-to-end contra un deployment de Convex,
// autenticado como vendedor vía Convex Auth (Password).
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ics81.mjs
//
//   # Opcional — habilita el aislamiento por vendedor:
//   SMOKE_OTHER_VENDOR_EMAIL=otra@... SMOKE_OTHER_VENDOR_PASSWORD=...
//
// ASERCIONES (~16)
//   login · feed con filtro type nunca devuelve página vacía si hay
//   coincidencias más adelante (función de relleno) · feed excluye borradas ·
//   feed hidrata prospectName/stage/registeredByName por fila · search
//   resuelve a prospectos por nombre · feed por prospectExactId acota a ese
//   prospecto · feed por outcome · followUps.list estado "vencido" solo
//   pendientes con fecha pasada · "pendiente" solo futuros · "completado" trae
//   resolution + completedByName · [2º vendedor] feed/list fuerzan la cartera
//   propia aunque se pase vendedorId.
//
// DATOS
//   Crea ~4 prospectos "[SMOKE ICS-81]" y los borra al final (incluso si falla).

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");
const otherEmail = process.env.SMOKE_OTHER_VENDOR_EMAIL;
const otherPassword = process.env.SMOKE_OTHER_VENDOR_PASSWORD;

const PREFIX = "[SMOKE ICS-81]";
const DAY = 24 * 60 * 60 * 1000;
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
  console.log("  ok ·", msg);
}
async function signIn(client, email, password) {
  const res = await client.action(anyApi.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signIn" },
  });
  const token = res.tokens?.token;
  if (!token) throw new Error(`login falló para ${email}`);
  client.setAuth(token);
}
async function newProspect(client, name) {
  const p = await client.mutation(anyApi.prospects.create, {
    name: `${PREFIX} ${name}`, phone: "5550000000", channel: "whatsapp", interest: "smoke", note: "",
  });
  createdProspectIds.push(p._id);
  return p;
}
async function feedAll(client, filters, numItems = 3) {
  const out = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    const res = await client.query(anyApi.interactions.feed, { paginationOpts: { numItems, cursor }, filters });
    out.push(...res.page);
    if (res.isDone || guard++ > 20) return out;
    cursor = res.continueCursor;
  }
}
async function listAll(client, filters, numItems = 5) {
  const out = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    const res = await client.query(anyApi.followUps.list, { paginationOpts: { numItems, cursor }, filters });
    out.push(...res.page);
    if (res.isDone || guard++ > 20) return out;
    cursor = res.continueCursor;
  }
}

async function run() {
  const vendor = new ConvexHttpClient(url);
  await signIn(vendor, vendorEmail, vendorPassword);
  assert(true, "login del vendedor");

  // P1: 5 interacciones intercaladas por tipo; una llamada borrada; una con outcome negativo.
  const p1 = await newProspect(vendor, "feed");
  const future = Date.now() + DAY;
  const seq = [
    { type: "llamada", note: "l1" },
    { type: "whatsapp", note: "w1" },
    { type: "llamada", note: "l2", outcome: "negativo" },
    { type: "whatsapp", note: "w2" },
    { type: "llamada", note: "l3 (se borra)" },
  ];
  for (const s of seq) {
    await vendor.mutation(anyApi.interactions.add, {
      prospectId: p1._id, type: s.type, note: s.note, outcome: s.outcome,
      nextFollowUp: { at: future, type: "llamada" },
    });
  }
  const ficha = await vendor.query(anyApi.prospects.get, { id: p1._id });
  const l3 = ficha.interactions.find((i) => i.note === "l3 (se borra)");
  await vendor.mutation(anyApi.interactions.remove, { id: l3._id });

  // --- feed filtrado por type=llamada, páginas de 2: relleno, sin página vacía ---
  const llamadas = await feedAll(vendor, { type: "llamada", prospectExactId: p1._id }, 2);
  assert(llamadas.length === 2, "feed type=llamada devuelve las 2 llamadas NO borradas (l1, l2) pese a whatsapps intercalados");
  assert(llamadas.every((i) => i.type === "llamada"), "todas las filas del feed cumplen el filtro type");
  assert(!llamadas.some((i) => i._id === l3._id), "la llamada borrada NO aparece en el feed");

  // --- hidratación por fila ---
  const anyRow = llamadas[0];
  assert(
    anyRow.prospectName === p1.name && anyRow.stage === "nuevo" && typeof anyRow.registeredByName === "string" && !!anyRow.registeredById,
    "cada fila del feed trae prospectName/stage/registeredById/registeredByName",
  );

  // --- search → prospectExactId ---
  const hits = await vendor.query(anyApi.prospects.search, { query: PREFIX });
  assert(hits.some((h) => h._id === p1._id), "prospects.search encuentra el prospecto por nombre");

  // --- feed por prospecto exacto (todos los tipos, sin borradas) ---
  const p1feed = await feedAll(vendor, { prospectExactId: p1._id }, 3);
  assert(p1feed.length === 4, "feed por prospectExactId trae las 4 interacciones vivas de P1");

  // --- feed por outcome ---
  const negativos = await feedAll(vendor, { outcome: "negativo", prospectExactId: p1._id }, 5);
  assert(negativos.length === 1 && negativos[0].note === "l2", "feed outcome=negativo trae solo la interacción negativa");

  // --- followUps.list: vencido vs pendiente ---
  const overdueProspect = await newProspect(vendor, "vencido");
  await vendor.mutation(anyApi.interactions.add, {
    prospectId: overdueProspect._id, type: "llamada", note: "primer contacto",
    nextFollowUp: { at: Date.now() - 5 * DAY, type: "llamada" },
  });

  const vencidos = await listAll(vendor, { estado: "vencido" });
  assert(
    vencidos.some((f) => f.prospectId === overdueProspect._id) && vencidos.every((f) => f.vencido && f.status === "pendiente"),
    "followUps.list estado='vencido' devuelve solo pendientes con fecha pasada",
  );
  assert(!vencidos.some((f) => f.prospectId === p1._id), "el seguimiento futuro de P1 NO aparece en 'vencido'");

  const pendientes = await listAll(vendor, { estado: "pendiente" });
  assert(
    pendientes.some((f) => f.prospectId === p1._id) && !pendientes.some((f) => f.prospectId === overdueProspect._id),
    "estado='pendiente' devuelve los futuros y no los vencidos",
  );

  // --- completado ---
  const p1follow = (await vendor.query(anyApi.prospects.get, { id: p1._id })).nextFollowUp;
  await vendor.mutation(anyApi.followUps.complete, { id: p1follow._id, resolution: "hecho" });
  const completados = await listAll(vendor, { estado: "completado" });
  const row = completados.find((f) => f._id === p1follow._id);
  assert(!!row && row.resolution === "hecho" && typeof row.completedByName === "string", "estado='completado' trae resolution + completedByName");

  // --- aislamiento por vendedor (opcional) ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await signIn(other, otherEmail, otherPassword);
    const otherUser = await other.query(anyApi.users.currentUser, {});
    const q = await newProspect(other, "de otro vendedor");
    await other.mutation(anyApi.interactions.add, {
      prospectId: q._id, type: "llamada", note: "ajena",
      nextFollowUp: { at: Date.now() - 2 * DAY, type: "llamada" },
    });
    const meAsking = await feedAll(vendor, { vendedorId: otherUser._id }, 10);
    assert(!meAsking.some((i) => i.prospectId === q._id), "feed: pasar vendedorId ajeno NO devuelve interacciones del otro vendedor");
    const listAsking = await listAll(vendor, { vendedorId: otherUser._id, estado: "vencido" });
    assert(!listAsking.some((f) => f.prospectId === q._id), "followUps.list: pasar vendedorId ajeno NO devuelve seguimientos del otro vendedor");
  } else {
    console.log("  -- caso 'aislamiento por vendedor' omitido (SMOKE_OTHER_VENDOR_* no seteadas)");
  }
}

async function cleanup() {
  for (const id of createdProspectIds) {
    try {
      await admin.mutation(anyApi.testHelpers.deleteProspectCascade, { id });
    } catch (err) {
      console.warn(`  no se pudo limpiar ${id}: ${err.message}`);
    }
  }
}

run()
  .then(async () => {
    await cleanup();
    console.log(`\n${passed} aserciones pasaron. Datos de prueba borrados.`);
  })
  .catch(async (err) => {
    console.error("\n" + err.message);
    await cleanup();
    console.error("Datos de prueba borrados. Smoke test FALLÓ.");
    process.exit(1);
  });
