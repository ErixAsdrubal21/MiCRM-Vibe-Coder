// Smoke test de ICS-85 (timeline.listByProspect + recordTimelineEvent + backfill).
// Sin navegador: ejercita la query paginada end-to-end contra un deployment de
// Convex, autenticado como vendedor vía Convex Auth (Password). La siembra de
// eventos usa un helper interno (testHelpers:seedTimelineForSmoke) porque el
// cableado desde las mutations es ICS-79/ICS-80.
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ics85.mjs
//
// ASERCIONES (~12)
//   login · siembra ok · paginación: 1 cursor, orden `at` desc dentro y entre
//   páginas, sin duplicados, termina con isDone · la interacción borrada NO
//   aparece hidratada (su evento sí sigue contándose en la tabla) · quedan 2
//   eventos `interaccion` visibles, todos con registeredByName · el evento
//   `venta` trae amount/product · `cierre-seguimiento` trae resolution y
//   completedByName · `cambio-etapa` trae fromStage/toStage · todo evento
//   hidratado tiene actorName.
//
// DATOS
//   Crea 1 prospecto "[SMOKE ICS-85]" y lo borra al final (incluso si falla).

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");

const PREFIX = "[SMOKE ICS-85]";
let passed = 0;
const createdProspectIds = [];

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

async function run() {
  const vendor = new ConvexHttpClient(url);
  await signIn(vendor, vendorEmail, vendorPassword);
  assert(true, "login del vendedor");

  const prospect = await vendor.mutation(anyApi.prospects.create, {
    name: `${PREFIX} timeline`,
    phone: "5550000000",
    channel: "whatsapp",
    interest: "smoke",
    note: "",
  });
  createdProspectIds.push(prospect._id);

  const admin = new ConvexHttpClient(url);
  admin.setAdminAuth(deployKey);
  const seed = await admin.mutation(anyApi.testHelpers.seedTimelineForSmoke, { prospectId: prospect._id });
  assert(seed.totalEvents === 6, `siembra: ${seed.totalEvents} eventos en la tabla (3 interaccion + venta + cierre + cambio-etapa)`);

  // --- paginación: un solo cursor, páginas de 3 ---
  const all = [];
  let cursor = null;
  let pages = 0;
  for (;;) {
    const res = await vendor.query(anyApi.timeline.listByProspect, {
      prospectId: prospect._id,
      paginationOpts: { numItems: 3, cursor },
    });
    pages++;
    all.push(...res.page);
    if (res.isDone) {
      assert(true, `la paginación termina con isDone tras ${pages} páginas`);
      break;
    }
    assert(typeof res.continueCursor === "string" && res.continueCursor.length > 0, `página ${pages}: continueCursor es un string`);
    cursor = res.continueCursor;
    if (pages > 10) throw new Error("la paginación no termina");
  }

  // --- orden global `at` desc, sin duplicados ---
  const ids = all.map((e) => e._id);
  assert(new Set(ids).size === ids.length, "sin eventos duplicados entre páginas");
  const ats = all.map((e) => e.at);
  assert(ats.every((v, i) => i === 0 || ats[i - 1] >= v), "orden `at` descendente dentro y entre páginas");

  // --- interacción borrada no aparece hidratada ---
  const interaccionEvents = all.filter((e) => e.type === "interaccion");
  assert(
    interaccionEvents.length === seed.visibleInteractionEvents,
    `quedan ${seed.visibleInteractionEvents} eventos 'interaccion' visibles (la borrada se omite)`,
  );
  assert(
    !interaccionEvents.some((e) => e.interaction?._id === seed.deletedInteractionId),
    "el evento de la interacción borrada no está en el resultado hidratado",
  );
  assert(
    all.length === seed.totalEvents - 1,
    `se devuelven ${all.length} eventos hidratados de ${seed.totalEvents} en la tabla (1 oculto por borrado)`,
  );

  // --- hidratación por tipo ---
  assert(
    interaccionEvents.every((e) => e.interaction && typeof e.interaction.registeredByName === "string"),
    "cada evento 'interaccion' trae la interacción con registeredByName",
  );
  const venta = all.find((e) => e.type === "venta");
  assert(venta?.sale?.amount === 12345 && venta.sale.product === "Producto de prueba", "el evento 'venta' trae amount y product desde sales");
  const cierre = all.find((e) => e.type === "cierre-seguimiento");
  assert(
    cierre?.followUpClosure?.resolution === "hecho" && typeof cierre.followUpClosure.completedByName === "string",
    "el evento 'cierre-seguimiento' trae resolution y completedByName",
  );
  const cambio = all.find((e) => e.type === "cambio-etapa");
  assert(
    cambio?.stageChange?.fromStage === "contactado" && cambio.stageChange.toStage === "cotizacion",
    "el evento 'cambio-etapa' trae fromStage/toStage",
  );
  assert(all.every((e) => typeof e.actorName === "string" && e.actorName.length > 0), "todo evento hidratado trae actorName");
}

async function cleanup() {
  const admin = new ConvexHttpClient(url);
  admin.setAdminAuth(deployKey);
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
