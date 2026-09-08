// Smoke test de ICS-92 (followUps.create + selector aislado por vendedor).
// No usa navegador — ejercita las mutations/queries end-to-end contra un
// deployment de Convex, autenticado como vendedor vía Convex Auth (Password).
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment>  # para la limpieza \
//   node scripts/smoke-ics92.mjs
//
//   # Opcional — habilita el caso "cartera de otro vendedor":
//   SMOKE_OTHER_VENDOR_EMAIL=otra@... SMOKE_OTHER_VENDOR_PASSWORD=...
//
// REQUISITOS
//   - El deployment debe tener Convex Auth configurado (JWT_PRIVATE_KEY/JWKS/SITE_URL).
//   - SMOKE_VENDOR_* debe ser una cuenta con rol "vendedor" ya provisionada.
//   - CONVEX_DEPLOY_KEY se usa solo para borrar los datos de prueba al final
//     (mutation interna testHelpers:deleteProspectCascade).
//
// ASERCIONES (~15)
//   login vendedor · alta feliz (sin error) · el at guardado, leído en zona
//   México, coincide con la fecha enviada (sin off-by-one) · la ficha muestra
//   nextFollowUp con tipo correcto · el followUp tiene ownerId ·
//   FECHAS: hoy permitido · ayer rechazado · mañana permitido · cruce de año
//   permitido y con round-trip correcto ·
//   2º alta para el mismo prospecto se rechaza (no lo pisa) · agendar en
//   prospecto ganado se rechaza · [si hay 2º vendedor] alta en prospecto
//   ajeno se rechaza · listMine no incluye el prospecto ajeno.
//
// DATOS
//   Crea ~7 prospectos con prefijo "[SMOKE ICS-92]" y los borra al final
//   (incluso si una aserción falla), vía deleteProspectCascade.

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { businessToday, msToBusinessDate } from "../convex/lib.js";

/** "YYYY-MM-DD" de hoy + offset días, en la zona del negocio — igual que el server. */
function mxDate(offsetDays) {
  const [y, m, d] = businessToday().split("-").map(Number);
  return msToBusinessDate(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
}

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");
const otherEmail = process.env.SMOKE_OTHER_VENDOR_EMAIL;
const otherPassword = process.env.SMOKE_OTHER_VENDOR_PASSWORD;

const PREFIX = "[SMOKE ICS-92]";
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

async function run() {
  const vendor = new ConvexHttpClient(url);
  await signIn(vendor, vendorEmail, vendorPassword);
  assert(true, "login del vendedor");

  const tomorrow = mxDate(1);

  // --- alta feliz + round-trip de fecha ---
  const a = await newProspect(vendor, "A feliz");
  await vendor.mutation(anyApi.followUps.create, { prospectId: a._id, date: tomorrow, type: "whatsapp" });
  assert(true, "followUps.create no lanzó error (caso feliz)");

  const fichaA = await vendor.query(anyApi.prospects.get, { id: a._id });
  assert(
    msToBusinessDate(fichaA.nextFollowUp.at) === tomorrow,
    `el at guardado, leído en zona México, es ${tomorrow} (sin off-by-one)`,
  );
  assert(fichaA.nextFollowUp.type === "whatsapp", "la ficha muestra nextFollowUp con el tipo correcto");
  assert(!!fichaA.nextFollowUp.ownerId, "el followUp creado tiene ownerId");

  // --- casos de fecha ---
  const hoyP = await newProspect(vendor, "hoy");
  await vendor.mutation(anyApi.followUps.create, { prospectId: hoyP._id, date: mxDate(0), type: "whatsapp" });
  assert(true, "agendar para HOY se permite");

  const mananaP = await newProspect(vendor, "manana");
  await vendor.mutation(anyApi.followUps.create, { prospectId: mananaP._id, date: mxDate(1), type: "whatsapp" });
  assert(true, "agendar para MAÑANA se permite");

  const ayerP = await newProspect(vendor, "ayer");
  await expectReject(
    () => vendor.mutation(anyApi.followUps.create, { prospectId: ayerP._id, date: mxDate(-1), type: "whatsapp" }),
    /pasado/i,
    "agendar para AYER se rechaza",
  );

  const anioP = await newProspect(vendor, "cruce de anio");
  const nextJan1 = `${Number(businessToday().slice(0, 4)) + 1}-01-01`;
  await vendor.mutation(anyApi.followUps.create, { prospectId: anioP._id, date: nextJan1, type: "whatsapp" });
  const fichaAnio = await vendor.query(anyApi.prospects.get, { id: anioP._id });
  assert(
    msToBusinessDate(fichaAnio.nextFollowUp.at) === nextJan1,
    `cruce de año: ${nextJan1} se guarda y se lee sin corrimiento`,
  );

  // --- duplicado ---
  await expectReject(
    () => vendor.mutation(anyApi.followUps.create, { prospectId: a._id, date: tomorrow, type: "llamada" }),
    /pendiente/i,
    "un 2º followUps.create para el mismo prospecto se rechaza",
  );

  // --- etapa cerrada ---
  const b = await newProspect(vendor, "B ganado");
  await vendor.mutation(anyApi.prospects.changeStage, { id: b._id, stage: "ganado", amount: 1000, product: "smoke" });
  await expectReject(
    () => vendor.mutation(anyApi.followUps.create, { prospectId: b._id, date: tomorrow, type: "whatsapp" }),
    /cerrado/i,
    "agendar para un prospecto ganado/perdido se rechaza",
  );

  // --- cartera de otro vendedor (opcional) ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await signIn(other, otherEmail, otherPassword);
    const d = await newProspect(other, "D de otro vendedor");
    await expectReject(
      () => vendor.mutation(anyApi.followUps.create, { prospectId: d._id, date: tomorrow, type: "whatsapp" }),
      /otro vendedor/i,
      "agendar en un prospecto de otro vendedor se rechaza",
    );
    const mine = await vendor.query(anyApi.prospects.listMine, {});
    assert(!mine.some((p) => p._id === d._id), "prospects.listMine no incluye el prospecto del otro vendedor");
  } else {
    console.log("  -- caso 'cartera ajena' omitido (SMOKE_OTHER_VENDOR_* no seteadas)");
  }
}

async function expectReject(fn, pattern, msg) {
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    rejected = pattern.test(err.message);
  }
  assert(rejected, msg);
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
