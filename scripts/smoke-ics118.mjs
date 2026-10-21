// Smoke test de ICS-118 (permiso de Google por persona y desvinculación
// efectiva) — backend. Contra el deployment de DESARROLLO, con sesiones
// reales de Convex Auth y la misma regla que usa el login de Google
// (`resolveSignInUser`, vía testHelpers:smokeResolveSignInUser — un login
// real de Google no se puede automatizar).
//
// Comprueba: Google apagado por defecto; permitirlo y quitarlo solo una
// administradora; quitarlo borra la vinculación y los códigos OAuth
// pendientes, cierra sesiones y rechaza el siguiente login (también uno que
// estaba a medias); recuperar la contraseña por código y el restablecimiento
// de la administradora quitan Google; el cambio voluntario lo conserva;
// desactivar lo apaga y reactivar no lo devuelve; la administradora puede
// quitarse Google sin perder la sesión en la que lo hace.
//
// USO (se niega a correr contra producción):
//   node scripts/smoke-ics118.mjs
//
// DATOS
//   Cuentas delivered+ics118*@resend.dev (una administradora y un vendedor).
//   Se borran al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { convexRun } from "./convex-run.mjs";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const VEND = "delivered+ics118@resend.dev";
const ADMIN = "delivered+ics118-admin@resend.dev";
const pass = { [VEND]: randomBytes(12).toString("base64url"), [ADMIN]: randomBytes(12).toString("base64url") };

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun; // nunca imprime los argumentos si falla (scripts/convex-run.mjs)
const anon = () => new ConvexHttpClient(DEV_URL);
function authed(token) { const c = new ConvexHttpClient(DEV_URL); c.setAuth(token); return c; }
const errOf = async (p) => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
async function login(email) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email, password: pass[email], flow: "signIn" } });
  return authed(res.tokens.token);
}
const state = () => run("testHelpers:dumpSmokeAuth").smoke.find((u) => u.email === VEND);
const hasGoogle = (u) => u.accounts.some((a) => a.startsWith("google:"));
const resolve = (type, useExistingLink) => run("testHelpers:smokeResolveSignInUser", { email: VEND, type, useExistingLink });
const hash = (email, code) => createHash("sha256").update(`${email}:${code}`).digest("hex");

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  for (const email of [VEND, ADMIN]) run("users:provisionPassword", { email, password: pass[email] });
  const vendId = state()._id;
  const admin = await login(ADMIN);

  // 1) Apagado por defecto
  check("Cuenta nueva: Google apagado", state().googleAllowed === false);
  const r1 = resolve("oauth", false);
  check("Sin permiso, un login de Google con su correo se rechaza", !r1.ok && r1.reason.includes("no tiene permitido entrar con Google"), r1.reason);
  check("La contraseña no depende del permiso de Google", resolve("credentials", false).ok);

  // 2) Permisos
  const vend = await login(VEND);
  check("Un vendedor no puede cambiar el permiso de Google", Boolean((await errOf(vend.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true })))?.includes("Solo un administrador")));
  check("Sin sesión no se puede cambiar", Boolean(await errOf(anon().mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true }))));

  // 3) Permitir
  await admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true });
  check("Con permiso, la primera vinculación por correo se acepta", resolve("oauth", false).ok);
  const accountId = run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  check("Con permiso y ya vinculada, las entradas siguientes se aceptan", resolve("oauth", true).ok);
  const team = await admin.query(api.users.listTeam, {});
  const row = team.find((m) => m._id === vendId);
  check("Equipo muestra Google permitido y vinculado", row.googleAllowed === true && row.googleLinked === true);

  // 4) Quitar: con una sesión abierta y un login de Google a medias
  check("Antes de quitar: sesión abierta y código OAuth pendiente", (await vend.query(api.users.currentUser, {}))?.email === VEND && run("testHelpers:countSmokeVerificationCodes", { accountId }) === 1);
  await admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: false });
  const s4 = state();
  check("Quitar borra la vinculación y apaga el permiso", !hasGoogle(s4) && s4.googleAllowed === false);
  check("…borra el código OAuth pendiente", run("testHelpers:countSmokeVerificationCodes", { accountId }) === 0);
  check("…cierra sus sesiones (la abierta deja de ver datos)", s4.sessions === 0 && (await vend.query(api.users.currentUser, {})) === null);
  const r4 = resolve("oauth", false);
  check("…y un login de Google posterior (o el que estaba a medias) se rechaza, sin revincular", !r4.ok && !hasGoogle(state()), r4.reason);
  check("Conserva la contraseña: sigue entrando con ella", (await (await login(VEND)).query(api.users.currentUser, {}))?.email === VEND);

  // 5) Recuperar la contraseña por código quita Google
  await admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true });
  run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  run("testHelpers:setSmokeResetCode", { email: VEND, codeHash: hash(VEND, "11223344"), expiresAt: Date.now() + 600000 });
  pass[VEND] = randomBytes(12).toString("base64url");
  const r5 = await anon().mutation(api.passwordReset.confirm, { email: VEND, code: "11223344", newPassword: pass[VEND] });
  const s5 = state();
  check("Recuperar por código quita la vinculación y el permiso de Google", r5.ok && !hasGoogle(s5) && s5.googleAllowed === false);

  // 6) El restablecimiento de la administradora quita Google
  await admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true });
  run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  const { tempPassword } = await admin.action(api.users.resetUserPassword, { userId: vendId });
  pass[VEND] = tempPassword;
  const s6 = state();
  check("Restablecer desde administración quita la vinculación y el permiso de Google", !hasGoogle(s6) && s6.googleAllowed === false && s6.sessions === 0);

  // 7) El cambio voluntario de contraseña conserva Google
  await admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true });
  run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  const vend7 = await login(VEND);
  const newPass = randomBytes(12).toString("base64url");
  await vend7.action(api.users.changeOwnPassword, { currentPassword: pass[VEND], newPassword: newPass });
  pass[VEND] = newPass;
  const s7 = state();
  check("Cambiar su propia contraseña conserva Google", hasGoogle(s7) && s7.googleAllowed === true);

  // 8) Desactivar apaga Google; reactivar no lo devuelve; no se puede permitir a una desactivada
  await admin.mutation(api.users.deactivateUser, { userId: vendId });
  check("Desactivar quita la vinculación y el permiso de Google", !hasGoogle(state()) && state().googleAllowed === false);
  check("No se puede permitir Google a una cuenta desactivada", Boolean((await errOf(admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true })))?.includes("desactivada")));
  await admin.mutation(api.users.reactivateUser, { userId: vendId });
  check("Reactivar no devuelve el permiso de Google", state().googleAllowed === false && !resolve("oauth", false).ok);

  // 9) La administradora puede quitarse Google sin perder la sesión en la que lo hace
  const adminId = run("testHelpers:dumpSmokeAuth").smoke.find((u) => u.email === ADMIN)._id;
  const adminOther = await login(ADMIN);
  await admin.mutation(api.users.setGoogleAllowed, { userId: adminId, allowed: true });
  await admin.mutation(api.users.setGoogleAllowed, { userId: adminId, allowed: false });
  check("Quitarse Google a sí misma: esta sesión sigue abierta", (await admin.query(api.users.currentUser, {}))?.email === ADMIN);
  check("…y sus otras sesiones se cierran", (await adminOther.query(api.users.currentUser, {})) === null);
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
