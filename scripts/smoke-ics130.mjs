// Smoke test de ICS-130 (cambiar el rol de un miembro del equipo) — backend.
// Contra el deployment de DESARROLLO, con sesiones reales de Convex Auth.
//
// Comprueba: solo una administradora cambia roles y nunca el suyo; no se
// cambia una cuenta desactivada; un vendedor con prospectos activos u
// oportunidades abiertas no pasa a administrador (opción A, 2026-10-20) y sí
// cuando todo lo suyo está cerrado; el cambio cierra sus sesiones, le da los
// permisos del nuevo rol y queda en la bitácora; falla simulada a media
// operación no cambia nada; dos administradoras que se degradan una a otra al
// mismo tiempo nunca dejan el CRM sin administradora.
//
// USO (se niega a correr contra producción; usa `npx convex env set/remove
// TEST_FAILPOINT` en dev y la borra al final):
//   node scripts/smoke-ics130.mjs
//
// DATOS
//   Cuentas delivered+ics130*@resend.dev y prospectos "[SMOKE ICS-130] …";
//   se borran al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { errorMessage } from "../src/lib/errors.js";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const VEND = "delivered+ics130@resend.dev";
const VEND2 = "delivered+ics130-b@resend.dev";
const ADMIN1 = "delivered+ics130-admin1@resend.dev";
const ADMIN2 = "delivered+ics130-admin2@resend.dev";
const ALL = [VEND, VEND2, ADMIN1, ADMIN2];
const pass = Object.fromEntries(ALL.map((e) => [e, randomBytes(12).toString("base64url")]));
const prospectIds = [];

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
function run(fn, args = {}) {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return out ? JSON.parse(out) : null;
}
const setFailpoint = (name) =>
  execFileSync("npx", name ? ["convex", "env", "set", "TEST_FAILPOINT", name] : ["convex", "env", "remove", "TEST_FAILPOINT"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = () => new ConvexHttpClient(DEV_URL);
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
async function login(email) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email, password: pass[email], flow: "signIn" } });
  const c = new ConvexHttpClient(DEV_URL);
  c.setAuth(res.tokens.token);
  return c;
}
const roleOf = (email) => run("testHelpers:dumpSmokeAuth").smoke.find((u) => u.email === email)?.role;
const roleEvents = (email) => run("testHelpers:smokeSecurityEvents", { email }).filter((e) => e.type === "role_changed");
async function newProspect(client, name) {
  const p = await client.mutation(api.prospects.create, { name: `[SMOKE ICS-130] ${name}`, phone: "5550000000", channel: "otro", interest: "x", note: "x" });
  prospectIds.push(p._id);
  return p._id;
}

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: VEND2, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN1, role: "administrador" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN2, role: "administrador" });
  for (const email of ALL) run("users:provisionPassword", { email, password: pass[email] });
  const ids = Object.fromEntries(run("testHelpers:dumpSmokeAuth").smoke.map((u) => [u.email, u._id]));
  const admin1 = await login(ADMIN1);
  const vend = await login(VEND);

  // Permisos y reglas básicas
  const e1 = await caught(vend.mutation(api.users.changeUserRole, { userId: ids[VEND2], role: "administrador" }));
  check("Un vendedor no puede cambiar roles", Boolean(e1) && errorMessage(e1, "").startsWith("Solo un administrador"), errorMessage(e1, "—"));
  const e2 = await caught(admin1.mutation(api.users.changeUserRole, { userId: ids[ADMIN1], role: "vendedor" }));
  check("Nadie cambia su propio rol", errorMessage(e2, "") === "No puedes cambiar tu propio rol.");
  await admin1.mutation(api.users.changeUserRole, { userId: ids[VEND2], role: "vendedor" });
  check("Cambiar al mismo rol no hace nada ni deja evento", roleEvents(VEND2).length === 0);
  await admin1.mutation(api.users.deactivateUser, { userId: ids[VEND2] });
  const e3 = await caught(admin1.mutation(api.users.changeUserRole, { userId: ids[VEND2], role: "administrador" }));
  check("Una cuenta desactivada no cambia de rol", errorMessage(e3, "").includes("desactivada"));
  await admin1.mutation(api.users.reactivateUser, { userId: ids[VEND2] });

  // Opción A: con cartera activa no pasa a administrador
  const p1 = await newProspect(vend, "Activo");
  const e4 = await caught(admin1.mutation(api.users.changeUserRole, { userId: ids[VEND], role: "administrador" }));
  check("Vendedor con un prospecto activo no pasa a administrador (mensaje claro)", errorMessage(e4, "").includes("1 prospecto activo"), errorMessage(e4, "—"));
  await vend.mutation(api.prospects.changeStage, { id: p1, stage: "perdido", lossReason: "precio" });
  const p2 = await newProspect(vend, "Con oportunidad");
  await vend.mutation(api.opportunities.create, { prospectId: p2, name: "Op", product: "x", estimatedAmount: 100 });
  await vend.mutation(api.prospects.changeStage, { id: p2, stage: "perdido", lossReason: "precio" });
  const e5 = await caught(admin1.mutation(api.users.changeUserRole, { userId: ids[VEND], role: "administrador" }));
  check("…ni con una oportunidad abierta", errorMessage(e5, "").includes("1 oportunidad abierta"), errorMessage(e5, "—"));
  check("…y el rol no cambió", roleOf(VEND) === "vendedor" && roleEvents(VEND).length === 0);
  const opp = (await vend.query(api.opportunities.listByProspect, { prospectId: p2, paginationOpts: { numItems: 10, cursor: null } })).page[0];
  await vend.mutation(api.opportunities.markLost, { id: opp._id, lossReason: "precio" });

  // Falla simulada a media operación → nada cambia
  setFailpoint("change_role_after_patch");
  await sleep(2000);
  const e6 = await caught(admin1.mutation(api.users.changeUserRole, { userId: ids[VEND], role: "administrador" }));
  setFailpoint(null);
  await sleep(2000);
  check("Falla simulada a media operación: falla y no cambia nada (rol, sesión, bitácora)",
    Boolean(e6) && roleOf(VEND) === "vendedor" && roleEvents(VEND).length === 0 && Boolean(await vend.query(api.users.currentUser, {})));

  // Con todo cerrado sí pasa a administrador
  await admin1.mutation(api.users.changeUserRole, { userId: ids[VEND], role: "administrador" });
  check("Con todo cerrado, pasa a administrador", roleOf(VEND) === "administrador");
  check("…cierra sus sesiones", (await vend.query(api.users.currentUser, {})) === null);
  const ev = roleEvents(VEND);
  check("…y queda en la bitácora (de vendedor a administrador, por la administradora)",
    ev.length === 1 && ev[0].actorId === ids[ADMIN1] && ev[0].details?.fromRole === "vendedor" && ev[0].details?.toRole === "administrador");
  const vendNow = await login(VEND);
  check("Con su nuevo rol ve lo de administración", Array.isArray(await vendNow.query(api.users.listTeam, {})));
  const e7 = await caught(newProspect(vendNow, "Ya no"));
  check("…y ya no opera como vendedor", errorMessage(e7, "").startsWith("Solo un vendedor"), errorMessage(e7, "—"));

  // Degradar a una administradora
  await admin1.mutation(api.users.changeUserRole, { userId: ids[ADMIN2], role: "vendedor" });
  check("Una administradora puede pasar a vendedora", roleOf(ADMIN2) === "vendedor" && roleEvents(ADMIN2)[0]?.details?.toRole === "vendedor");

  // Dos administradoras se degradan una a otra al mismo tiempo
  const a1 = await login(ADMIN1);
  const results = await Promise.allSettled([
    a1.mutation(api.users.changeUserRole, { userId: ids[VEND], role: "vendedor" }),
    vendNow.mutation(api.users.changeUserRole, { userId: ids[ADMIN1], role: "vendedor" }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const admins = [ADMIN1, VEND].filter((e) => roleOf(e) === "administrador").length;
  check("Degradación mutua simultánea: solo una gana y queda una administradora", ok === 1 && admins === 1, `${ok} aceptada(s), ${admins} administradora(s)`);
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  for (const id of prospectIds) run("testHelpers:deleteProspectCascade", { id });
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")), `+ ${prospectIds.length} prospectos`);
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
