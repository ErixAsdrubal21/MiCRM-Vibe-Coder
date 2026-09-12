// Smoke test de ICS-79 (interactions.add robustecido + interactions.edit + interactions.remove).
// Sin navegador: ejercita las mutations end-to-end contra un deployment de
// Convex, autenticado como vendedor vía Convex Auth (Password).
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ics79.mjs
//
//   # Opcional — habilita el caso "otro vendedor no puede editar":
//   SMOKE_OTHER_VENDOR_EMAIL=otra@... SMOKE_OTHER_VENDOR_PASSWORD=...
//
// ASERCIONES (~16)
//   login · nota vacía rechazada (alta y edición) · fecha futura (>5min) y
//   fecha de >1 año rechazadas · fecha de ayer OK y `at` reflejado · alta feliz:
//   source "manual", evento `interaccion` en el timeline, nextFollowUpId en la
//   interacción y ownerId en el follow-up · edición del autor deja editedAt ·
//   editar el `at` re-data el evento del timeline · [si hay 2º vendedor] otro
//   no puede editar · remove marca deletedAt, la interacción desaparece de
//   prospects.get y del timeline hidratado · 2º remove rechazado · editar una
//   borrada rechazado.
//
// DATOS
//   Crea ~5 prospectos "[SMOKE ICS-79]" y los borra al final (incluso si falla).

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");
const otherEmail = process.env.SMOKE_OTHER_VENDOR_EMAIL;
const otherPassword = process.env.SMOKE_OTHER_VENDOR_PASSWORD;

const PREFIX = "[SMOKE ICS-79]";
const DAY = 24 * 60 * 60 * 1000;
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

async function expectReject(fn, pattern, msg) {
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    rejected = pattern.test(err.message);
    if (!rejected) console.warn(`    (mensaje inesperado: ${err.message})`);
  }
  assert(rejected, msg);
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
    name: `${PREFIX} ${name}`,
    phone: "5550000000",
    channel: "whatsapp",
    interest: "smoke",
    note: "",
  });
  createdProspectIds.push(p._id);
  return p;
}

const timelineAll = async (client, prospectId) => {
  const out = [];
  let cursor = null;
  for (;;) {
    const res = await client.query(anyApi.timeline.listByProspect, {
      prospectId,
      paginationOpts: { numItems: 20, cursor },
    });
    out.push(...res.page);
    if (res.isDone) return out;
    cursor = res.continueCursor;
  }
};

async function run() {
  const vendor = new ConvexHttpClient(url);
  await signIn(vendor, vendorEmail, vendorPassword);
  assert(true, "login del vendedor");

  const tomorrowFollowUp = Date.now() + DAY;

  // --- validación de nota ---
  const pv = await newProspect(vendor, "validacion");
  await expectReject(
    () => vendor.mutation(anyApi.interactions.add, {
      prospectId: pv._id, type: "llamada", note: "   ",
      nextFollowUp: { at: tomorrowFollowUp, type: "llamada" },
    }),
    /vacía/i,
    "nota vacía rechazada en el alta",
  );

  // --- validación de fecha ---
  await expectReject(
    () => vendor.mutation(anyApi.interactions.add, {
      prospectId: pv._id, type: "llamada", note: "futura",
      at: Date.now() + 30 * 60 * 1000,
      nextFollowUp: { at: tomorrowFollowUp, type: "llamada" },
    }),
    /futura/i,
    "fecha futura (>5 min) rechazada",
  );
  await expectReject(
    () => vendor.mutation(anyApi.interactions.add, {
      prospectId: pv._id, type: "llamada", note: "vieja",
      at: Date.now() - 400 * DAY,
      nextFollowUp: { at: tomorrowFollowUp, type: "llamada" },
    }),
    /antigua/i,
    "fecha de más de 1 año atrás rechazada",
  );

  // --- alta feliz retroactiva ---
  const yesterday = Date.now() - DAY;
  const happy = await newProspect(vendor, "feliz");
  await vendor.mutation(anyApi.interactions.add, {
    prospectId: happy._id, type: "whatsapp", note: "Hablé ayer con el cliente",
    at: yesterday, outcome: "positivo",
    nextFollowUp: { at: tomorrowFollowUp, type: "whatsapp" },
  });
  const fichaHappy = await vendor.query(anyApi.prospects.get, { id: happy._id });
  assert(fichaHappy.interactions.length === 1, "la interacción aparece en prospects.get");
  const it = fichaHappy.interactions[0];
  assert(Math.abs(it.at - yesterday) < 1000, "el `at` guardado es la fecha de ayer que se envió");
  assert(it.source === "manual", "source === 'manual'");
  assert(it.outcome === "positivo", "outcome guardado");
  assert(!!it.nextFollowUpId, "la interacción quedó con nextFollowUpId");
  assert(!!fichaHappy.nextFollowUp?.ownerId, "el follow-up siguiente tiene ownerId");

  const tl1 = await timelineAll(vendor, happy._id);
  const evt = tl1.find((e) => e.type === "interaccion" && e.interaction?._id === it._id);
  assert(!!evt, "hay un evento `interaccion` en el timeline para esa interacción");
  assert(Math.abs(evt.at - yesterday) < 1000, "el evento del timeline tiene el `at` de la interacción");

  // --- edición del autor ---
  await vendor.mutation(anyApi.interactions.edit, { id: it._id, note: "Corrijo: fue una llamada", type: "llamada" });
  const afterEdit = (await vendor.query(anyApi.prospects.get, { id: happy._id })).interactions[0];
  assert(!!afterEdit.editedAt && afterEdit.type === "llamada", "edición del autor: editedAt seteado y cambios aplicados");

  await expectReject(
    () => vendor.mutation(anyApi.interactions.edit, { id: it._id, note: "  " }),
    /vacía/i,
    "editar con nota vacía rechazado",
  );

  // --- editar el `at` re-data el evento del timeline ---
  const twoDaysAgo = Date.now() - 2 * DAY;
  await vendor.mutation(anyApi.interactions.edit, { id: it._id, at: twoDaysAgo });
  const tl2 = await timelineAll(vendor, happy._id);
  const evt2 = tl2.find((e) => e.type === "interaccion" && e.interaction?._id === it._id);
  assert(evt2 && Math.abs(evt2.at - twoDaysAgo) < 1000, "editar el `at` re-data el evento del timeline");

  // --- otro vendedor no puede editar (opcional) ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await signIn(other, otherEmail, otherPassword);
    await expectReject(
      () => other.mutation(anyApi.interactions.edit, { id: it._id, note: "ajeno" }),
      /registraste/i,
      "otro vendedor no puede editar la interacción",
    );
  } else {
    console.log("  -- caso 'otro vendedor' omitido (SMOKE_OTHER_VENDOR_* no seteadas)");
  }

  // --- borrado suave ---
  await vendor.mutation(anyApi.interactions.remove, { id: it._id });
  const fichaAfterRemove = await vendor.query(anyApi.prospects.get, { id: happy._id });
  assert(fichaAfterRemove.interactions.length === 0, "la interacción borrada desaparece de prospects.get");
  const tl3 = await timelineAll(vendor, happy._id);
  assert(
    !tl3.some((e) => e.type === "interaccion" && e.interaction?._id === it._id),
    "la interacción borrada desaparece del timeline hidratado",
  );
  await expectReject(
    () => vendor.mutation(anyApi.interactions.remove, { id: it._id }),
    /ya fue eliminada/i,
    "un 2º remove se rechaza",
  );
  await expectReject(
    () => vendor.mutation(anyApi.interactions.edit, { id: it._id, note: "revivir" }),
    /ya fue eliminada/i,
    "no se puede editar una interacción borrada",
  );
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
