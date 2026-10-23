// Smoke test de ICS-121 (bitácora mínima de seguridad) — backend. Contra el
// deployment de DESARROLLO, con sesiones reales de Convex Auth y la ruta
// interna real del regreso de Google (como smoke-ics108).
//
// Comprueba que cada vía deja exactamente un evento con su tipo, quién lo
// hizo y a quién; que lo que no cambia nada no deja evento; que una
// operación revertida (falla simulada) tampoco; que los eventos no guardan
// nada sensible; y que la limpieza borra solo lo de más de 12 meses.
//
// USO (se niega a correr contra producción; usa `npx convex env set/remove
// TEST_FAILPOINT` en dev y la borra al final):
//   node scripts/smoke-ics121.mjs
//
// DATOS
//   Cuentas delivered+ics121*@resend.dev; se borran al final con sus eventos.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { convexEnvSet, convexRun } from "./convex-run.mjs";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const VEND = "delivered+ics121@resend.dev";
const ADMIN = "delivered+ics121-admin@resend.dev";
const pass = { [VEND]: randomBytes(12).toString("base64url"), [ADMIN]: randomBytes(12).toString("base64url") };
const ALLOWED_KEYS = ["type", "actorId", "targetUserId", "at", "details"];

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun; // nunca imprime los argumentos si falla (scripts/convex-run.mjs)
const setFailpoint = (name) => convexEnvSet("TEST_FAILPOINT", name || null); // valida que el destino sea dev (scripts/convex-run.mjs)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = () => new ConvexHttpClient(DEV_URL);
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
async function login(email) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email, password: pass[email], flow: "signIn" } });
  const c = new ConvexHttpClient(DEV_URL);
  c.setAuth(res.tokens.token);
  return c;
}
const events = () => run("testHelpers:smokeSecurityEvents", { email: VEND });
let seen = 0;
/** Eventos nuevos desde la última llamada. */
function newEvents() {
  const all = events();
  const fresh = all.slice(seen);
  seen = all.length;
  return fresh;
}
function expectOne(label, type, actorId, extra = () => true) {
  const fresh = newEvents();
  check(label, fresh.length === 1 && fresh[0].type === type && fresh[0].actorId === actorId && extra(fresh[0]),
    JSON.stringify(fresh.map((e) => ({ type: e.type, actor: e.actorId === actorId ? "ok" : e.actorId, details: e.details }))));
}
function expectNone(label) {
  const fresh = newEvents();
  check(label, fresh.length === 0, fresh.map((e) => e.type).join(", "));
}

/** Regreso de Google simulado por la ruta interna real (como smoke-ics108). */
function googleSignIn(email, sub) {
  const store = (args) => run("auth:store", { args });
  const verifier = store({ type: "verifier" });
  const signature = randomBytes(16).toString("hex");
  store({ type: "verifierSignature", verifier, signature });
  const code = store({ type: "userOAuth", provider: "google", providerAccountId: sub, profile: { email, name: "x" }, signature });
  store({ type: "verifyCodeAndSignIn", params: { code }, verifier, provider: "google", generateTokens: false, allowExtraProviders: false });
}

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  for (const email of [VEND, ADMIN]) run("users:provisionPassword", { email, password: pass[email] });
  const ids = Object.fromEntries(run("testHelpers:dumpSmokeAuth").smoke.map((u) => [u.email, u._id]));
  const admin = await login(ADMIN);
  expectNone("Sin cambios de acceso todavía, no hay eventos");

  // Desactivar / reactivar (y una desactivación revertida)
  setFailpoint("deactivate_after_sessions");
  await sleep(2000);
  await caught(admin.mutation(api.users.deactivateUser, { userId: ids[VEND] }));
  setFailpoint(null);
  await sleep(2000);
  expectNone("Una desactivación revertida por una falla no deja evento");
  await admin.mutation(api.users.deactivateUser, { userId: ids[VEND] });
  expectOne("Desactivar → user_deactivated, hecho por la administradora", "user_deactivated", ids[ADMIN], (e) => e.details?.googleRemoved === false);
  await admin.mutation(api.users.reactivateUser, { userId: ids[VEND] });
  expectOne("Reactivar → user_reactivated", "user_reactivated", ids[ADMIN]);
  await admin.mutation(api.users.reactivateUser, { userId: ids[VEND] });
  expectNone("Reactivar una cuenta ya activa no deja evento");

  // Google: permitir, vincular, quitar
  await admin.mutation(api.users.setGoogleAllowed, { userId: ids[VEND], allowed: true });
  expectOne("Permitir Google → google_allowed", "google_allowed", ids[ADMIN]);
  await admin.mutation(api.users.setGoogleAllowed, { userId: ids[VEND], allowed: true });
  expectNone("Permitirlo de nuevo no deja evento");
  googleSignIn(VEND, "smoke-ics121-sub");
  expectOne("Primera vinculación de Google → google_linked, hecho por la propia persona", "google_linked", ids[VEND]);
  googleSignIn(VEND, "smoke-ics121-sub");
  expectNone("Entrar otra vez con Google no deja evento");
  await admin.mutation(api.users.setGoogleAllowed, { userId: ids[VEND], allowed: false });
  expectOne("Quitar Google → google_removed", "google_removed", ids[ADMIN]);
  await admin.mutation(api.users.setGoogleAllowed, { userId: ids[VEND], allowed: false });
  expectNone("Quitarlo de nuevo no deja evento");

  // Contraseña: cambio propio, restablecimiento, recuperación por código, emergencia
  const vend2 = await login(VEND);
  await caught(vend2.action(api.users.changeOwnPassword, { currentPassword: "equivocada", newPassword: "otra-contraseña-larga" }));
  expectNone("Cambiar contraseña con la actual equivocada no deja evento");
  const newPass = randomBytes(12).toString("base64url");
  await vend2.action(api.users.changeOwnPassword, { currentPassword: pass[VEND], newPassword: newPass });
  pass[VEND] = newPass;
  expectOne("Cambiar su contraseña → password_changed, hecho por la propia persona", "password_changed", ids[VEND]);

  await admin.mutation(api.users.setGoogleAllowed, { userId: ids[VEND], allowed: true });
  newEvents();
  await admin.action(api.users.resetUserPassword, { userId: ids[VEND] });
  expectOne("Restablecer desde Equipo → password_reset_admin (y anota que quitó Google)", "password_reset_admin", ids[ADMIN], (e) => e.details?.googleRemoved === true);

  run("testHelpers:setSmokeResetCode", { email: VEND, codeHash: createHash("sha256").update(`${VEND}:12345678`).digest("hex"), expiresAt: Date.now() + 600000 });
  await anon().mutation(api.passwordReset.confirm, { email: VEND, code: "87654321", newPassword: "contraseña-larga-x" });
  expectNone("Un código equivocado no deja evento");
  await anon().mutation(api.passwordReset.confirm, { email: VEND, code: "12345678", newPassword: "contraseña-larga-x" });
  expectOne("Recuperar con código → password_reset_code (sin Google que quitar)", "password_reset_code", ids[VEND], (e) => e.details?.googleRemoved === false);

  run("users:setGoogleAllowedByEmail", { email: VEND, allowed: true });
  expectOne("Permitir Google por script → google_allowed sin autor y marcado como script", "google_allowed", undefined, (e) => e.details?.via === "script");
  run("users:resetPasswordByEmail", { email: VEND, newPassword: "contraseña-de-emergencia" });
  expectOne("Script de emergencia → password_reset_emergency", "password_reset_emergency", undefined, (e) => e.details?.via === "script");

  // Nada sensible
  const all = events();
  check("Los eventos solo guardan tipo, autor, persona, fecha y detalles no sensibles",
    all.every((e) => Object.keys(e).filter((k) => e[k] !== undefined && !k.startsWith("_")).every((k) => ALLOWED_KEYS.includes(k))) &&
    !JSON.stringify(all).match(/contraseña|12345678|GOCSPX|re_|scrypt|\$/i));

  // Retención de 12 meses
  const DAY = 24 * 60 * 60 * 1000;
  run("testHelpers:insertSmokeSecurityEvent", { email: VEND, ageMs: 400 * DAY });
  run("testHelpers:insertSmokeSecurityEvent", { email: VEND, ageMs: 300 * DAY });
  const before = events().length;
  run("securityEvents:cleanupOldSecurityEvents");
  const after = events();
  check("La limpieza borra solo lo de más de 12 meses", after.length === before - 1 && after.some((e) => Date.now() - e.at > 299 * DAY));
  check("Ningún evento tiene autor ajeno a las cuentas de prueba", after.every((e) => !e.actorId || [ids[VEND], ids[ADMIN]].includes(e.actorId)));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
