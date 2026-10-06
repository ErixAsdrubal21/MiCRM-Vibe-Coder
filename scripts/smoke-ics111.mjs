// Smoke test de ICS-111 (recuperar contraseña con código por correo) — backend.
// Llama la API de Convex directo, como lo haría cualquiera sin pasar por la
// pantalla, para comprobar las garantías del servidor (convex/passwordReset.js):
// respuesta y tiempo uniformes, límite de envíos reservado antes de reemplazar
// el código, código con vencimiento/intentos/un solo uso, cambio de contraseña
// y revocación de sesiones en una sola transacción, y aviso posterior.
//
// USO (solo contra el deployment de DESARROLLO de .env.local; se niega a
// correr contra producción):
//   node scripts/smoke-ics111.mjs
//
// QUÉ NECESITA
//   - Las funciones de testHelpers (setSmokeResetCode, dumpSmokeReset,
//     seedSmokeResetRequests, insertSmokeAuthUser, deleteSmokeAuthUsers).
//   - Permiso para `npx convex env set/remove PASSWORD_RESET_FAILPOINT` en dev
//     (se usa para simular fallas a media transacción; se borra al final).
//
// DATOS
//   Cuenta de prueba delivered+ics111@resend.dev (Resend acepta ese correo sin
//   entregar nada real). Se borra al final, incluso si falla, junto con sus
//   códigos y solicitudes (testHelpers:deleteSmokeAuthUsers).

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const EMAIL = "delivered+ics111@resend.dev";
const GHOST = "delivered+nadie-ics111@resend.dev"; // no existe
const OLD_PASS = randomBytes(9).toString("base64url");
const NEW_PASS = randomBytes(9).toString("base64url");
const HOUR = 60 * 60 * 1000;

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
  execFileSync("npx", name ? ["convex", "env", "set", "PASSWORD_RESET_FAILPOINT", name] : ["convex", "env", "remove", "PASSWORD_RESET_FAILPOINT"], { stdio: "ignore" });

const hash = (email, code) => createHash("sha256").update(`${email}:${code}`).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = () => new ConvexHttpClient(DEV_URL);
function authed(token) { const c = new ConvexHttpClient(DEV_URL); c.setAuth(token); return c; }
const errOf = async (p) => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function timed(fn) { const t = performance.now(); const r = await fn().catch((e) => ({ thrown: String(e.message) })); return { ms: performance.now() - t, r }; }
async function waitFor(pred, label, timeout = 30000) {
  const t = Date.now();
  while (Date.now() - t < timeout) { if (await pred()) return; await sleep(800); }
  throw new Error(`Tiempo agotado esperando: ${label}`);
}
const dump = () => run("testHelpers:dumpSmokeReset", { email: EMAIL });
const setCode = (code, ttlMs = 10 * 60 * 1000) => run("testHelpers:setSmokeResetCode", { email: EMAIL, codeHash: hash(EMAIL, code), expiresAt: Date.now() + ttlMs });
const confirm = (email, code, newPassword) => anon().mutation(api.passwordReset.confirm, { email, code, newPassword });
const request = (email) => anon().mutation(api.passwordReset.request, { email });
async function login(password) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email: EMAIL, password, flow: "signIn" } });
  return res.tokens;
}
const sees = async (token) => (await authed(token).query(api.users.currentUser, {}))?.email === EMAIL;

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: EMAIL, role: "vendedor" });
  run("users:provisionPassword", { email: EMAIL, password: OLD_PASS });

  // 1) El flujo `reset` de Convex Auth no queda expuesto
  const r1 = await errOf(anon().action(api.auth.signIn, { provider: "password", params: { email: EMAIL, flow: "reset" } }));
  const r2 = await errOf(anon().action(api.auth.signIn, { provider: "password", params: { email: GHOST, flow: "reset" } }));
  check("auth:signIn flow=reset deshabilitado igual para cualquier correo", Boolean(r1?.includes("not enabled") && r2?.includes("not enabled")));

  // 2) request: misma respuesta y tiempo exista o no la cuenta
  const tE = [], tG = [], answers = new Set();
  for (let i = 0; i < 6; i++) {
    const g = await timed(() => request(GHOST));
    const e = await timed(() => request(i % 2 ? "Delivered+ICS111@resend.dev" : EMAIL));
    tG.push(g.ms); tE.push(e.ms); answers.add(JSON.stringify(g.r)); answers.add(JSON.stringify(e.r));
  }
  check("request responde idéntico exista o no la cuenta", answers.size === 1 && answers.has("null"), [...answers].join(" | "));
  check("request tarda lo mismo exista o no la cuenta", Math.abs(median(tE) - median(tG)) < 60, `existe ${median(tE).toFixed(0)} ms / no existe ${median(tG).toFixed(0)} ms`);

  // 3) Intervalo de 60 s: de esas solicitudes solo pasó 1; una bloqueada conserva el código vigente
  await waitFor(() => dump().codes.length === 1, "primer código");
  await sleep(3000);
  let d = dump();
  check("Solicitudes seguidas: 1 registrada y 1 código", d.requests === 1 && d.codes.length === 1, `solicitudes ${d.requests}, códigos ${d.codes.length}`);
  const vigente = d.codes[0];
  await request(EMAIL);
  await sleep(3000);
  d = dump();
  check("Solicitud bloqueada conserva el código vigente (mismo id y hash)", d.codes.length === 1 && d.codes[0]._id === vigente._id && d.codes[0].codeHash === vigente.codeHash);

  // 4) Límite por hora: con 5 solicitudes en la última hora, la 6.ª no envía ni toca el código
  run("testHelpers:seedSmokeResetRequests", { email: EMAIL, agesMs: [50, 40, 30, 20, 10].map((m) => m * 60 * 1000) });
  await request(EMAIL);
  await sleep(4000);
  d = dump();
  check("6.ª solicitud en una hora: bloqueada", d.requests === 5, `solicitudes ${d.requests}`);
  check("…y el código vigente no cambió", d.codes.length === 1 && d.codes[0]._id === vigente._id);
  run("testHelpers:seedSmokeResetRequests", { email: EMAIL, agesMs: [2 * HOUR, 50, 40, 30, 20].map((m) => (m > 1000 ? m : m * 60 * 1000)) });
  await request(EMAIL);
  await waitFor(() => dump().codes[0]?._id !== vigente._id, "código nuevo tras liberar cupo");
  d = dump();
  check("Con 4 en la última hora (y una de hace 2 h), sí envía y reemplaza el código", d.codes.length === 1 && d.codes[0]._id !== vigente._id);
  check("…y la solicitud de hace más de 1 h se limpió", d.requests === 5, `solicitudes ${d.requests}`);

  // 5) Solicitudes simultáneas tras el intervalo: solo una reserva cupo
  run("testHelpers:seedSmokeResetRequests", { email: EMAIL, agesMs: [2 * 60 * 1000] });
  const antes = dump();
  await Promise.all(Array.from({ length: 5 }, () => request(EMAIL)));
  await waitFor(() => dump().requests > antes.requests, "solicitud simultánea");
  await sleep(4000);
  d = dump();
  check("5 simultáneas: solo 1 reserva cupo", d.requests === antes.requests + 1, `${antes.requests} → ${d.requests}`);
  check("…y queda exactamente 1 código", d.codes.length === 1);

  // 6) confirm: respuestas inválidas uniformes
  setCode("11111111");
  const wrong = await timed(() => confirm(EMAIL, "22222222", NEW_PASS));
  const ghost = await timed(() => confirm(GHOST, "22222222", NEW_PASS));
  check("Código incorrecto → INVALID_CODE", wrong.r?.reason === "INVALID_CODE");
  check("Correo inexistente → la misma respuesta", JSON.stringify(ghost.r) === JSON.stringify(wrong.r));
  check("confirm tarda parecido (inexistente vs incorrecto)", Math.abs(wrong.ms - ghost.ms) < 250, `${wrong.ms.toFixed(0)} ms / ${ghost.ms.toFixed(0)} ms`);
  check("El intento fallido quedó contado", dump().codes[0]?.attempts === 1);
  const short = await confirm(EMAIL, "11111111", "corta");
  check("Contraseña corta → INVALID_PASSWORD sin gastar el código", short.reason === "INVALID_PASSWORD" && dump().codes[0]?.attempts === 1);

  setCode("33333333", -1000);
  check("Código vencido se rechaza", (await confirm(EMAIL, "33333333", NEW_PASS)).reason === "INVALID_CODE");
  check("…y se borra", dump().codes.length === 0);

  setCode("44444444");
  for (let i = 0; i < 5; i++) await confirm(EMAIL, "00000000", NEW_PASS);
  check("5 intentos fallidos invalidan el código", dump().codes.length === 0);
  check("…y después ni el código correcto sirve", (await confirm(EMAIL, "44444444", NEW_PASS)).reason === "INVALID_CODE");

  setCode("55555555");
  setCode("66666666");
  check("Código reemplazado deja de servir", (await confirm(EMAIL, "55555555", NEW_PASS)).reason === "INVALID_CODE");

  // 7) Fallas a media transacción: nada cambia y el código sigue sirviendo
  const tokF = await login(OLD_PASS);
  for (const point of ["after_password_change", "after_sessions_revoked"]) {
    setCode("77777777");
    const codeBefore = dump().codes[0];
    setFailpoint(point);
    await sleep(2000);
    const failed = await errOf(confirm(EMAIL, "77777777", NEW_PASS));
    setFailpoint(null);
    await sleep(2000);
    check(`Falla simulada (${point}): la operación falla`, Boolean(failed?.includes("Falla simulada")));
    check(`  …la contraseña anterior sigue entrando`, Boolean((await login(OLD_PASS))?.token));
    check(`  …la sesión abierta sigue viva`, await sees(tokF.token));
    const codeAfter = dump().codes[0];
    check(`  …el código sigue vigente y sin gastar`, codeAfter?._id === codeBefore._id && codeAfter.attempts === 0);
  }

  // 8) Éxito con dos sesiones abiertas
  const tokA = await login(OLD_PASS);
  const tokB = await login(OLD_PASS);
  check("Antes: las dos sesiones ven al usuario y leen datos", (await sees(tokA.token)) && (await sees(tokB.token)) && (await errOf(authed(tokA.token).query(api.prospects.list, {}))) === null);
  const ok = await confirm(EMAIL, "77777777", NEW_PASS);
  check("Código correcto cambia la contraseña", ok.ok === true && ok.loginEmail === EMAIL);
  check("El código no se puede reutilizar", (await confirm(EMAIL, "77777777", NEW_PASS)).reason === "INVALID_CODE");
  check("Token anterior A ya no ve al usuario", !(await sees(tokA.token)));
  check("Token anterior B tampoco", !(await sees(tokB.token)));
  check("Token anterior A ya no lee datos", Boolean((await errOf(authed(tokA.token).query(api.prospects.list, {})))?.includes("No autenticado")));
  check("Token anterior A no puede ejecutar mutaciones", (await errOf(authed(tokA.token).mutation(api.prospects.create, { name: "[SMOKE VENTAS] no debe existir", phone: "1", channel: "otro", interest: "", note: "" }))) !== null);
  const refreshed = await anon().action(api.auth.signIn, { refreshToken: tokA.refreshToken }).catch(() => null);
  check("El refresh token anterior no da sesión nueva", !refreshed?.tokens);
  check("La contraseña anterior ya no entra", (await errOf(login(OLD_PASS))) !== null);
  const tokNew = await login(NEW_PASS);
  check("La contraseña nueva entra y ve datos", Boolean(tokNew?.token) && (await sees(tokNew.token)));

  // 9) signUp sigue cerrado
  check("signUp sigue bloqueado", Boolean((await errOf(anon().action(api.auth.signIn, { provider: "password", params: { email: GHOST, password: "Clave12345", flow: "signUp" } })))?.includes("Registro público deshabilitado")));
} catch (err) {
  failures++;
  console.log(`✘ Error en la prueba: ${err.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
