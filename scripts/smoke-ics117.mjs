// Smoke test de ICS-117 (desactivar y reactivar usuarios) — backend.
// Llama la API de Convex directo, con sesiones reales de Convex Auth, para
// comprobar las garantías del servidor (convex/users.js deactivateUser /
// reactivateUser, `isActiveUser` en convex/permissions.js y convex/auth.js):
// permisos, cierre inmediato de sesiones, bloqueo del login y de la
// recuperación de contraseña, retiro de la vinculación con Google,
// reactivación sin restaurar nada, atomicidad y desactivación mutua
// simultánea de dos administradoras.
//
// USO (solo contra el deployment de DESARROLLO de .env.local; se niega a
// correr contra producción):
//   node scripts/smoke-ics117.mjs
//
// QUÉ NECESITA
//   - Las funciones de testHelpers (insertSmokeAuthUser, insertSmokeGoogleAccount,
//     dumpSmokeAuth, setSmokeResetCode, dumpSmokeReset, deleteSmokeAuthUsers).
//   - Permiso para `npx convex env set/remove TEST_FAILPOINT` en dev (falla
//     simulada a media desactivación; se borra al final).
//
// DATOS
//   Cuentas de prueba delivered+ics117*@resend.dev (dos administradoras y un
//   vendedor). Se borran al final, incluso si falla.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { convexEnvSet, convexRun } from "./convex-run.mjs";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const VEND = "delivered+ics117@resend.dev";
const ADMIN1 = "delivered+ics117-admin1@resend.dev";
const ADMIN2 = "delivered+ics117-admin2@resend.dev";
const PASS = { [VEND]: randomBytes(12).toString("base64url"), [ADMIN1]: randomBytes(12).toString("base64url"), [ADMIN2]: randomBytes(12).toString("base64url") };

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun; // nunca imprime los argumentos si falla (scripts/convex-run.mjs)
const setFailpoint = (name) => convexEnvSet("TEST_FAILPOINT", name || null); // valida que el destino sea dev (scripts/convex-run.mjs)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = () => new ConvexHttpClient(DEV_URL);
function authed(token) { const c = new ConvexHttpClient(DEV_URL); c.setAuth(token); return c; }
const errOf = async (p) => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
async function login(email) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email, password: PASS[email], flow: "signIn" } });
  return res.tokens.token;
}
const smoke = () => Object.fromEntries(run("testHelpers:dumpSmokeAuth").smoke.map((u) => [u.email, u]));
const hash = (email, code) => createHash("sha256").update(`${email}:${code}`).digest("hex");

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN1, role: "administrador" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN2, role: "administrador" });
  for (const email of [VEND, ADMIN1, ADMIN2]) run("users:provisionPassword", { email, password: PASS[email] });
  run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  const ids = Object.fromEntries(Object.values(smoke()).map((u) => [u.email, u._id]));

  const vend = authed(await login(VEND));
  const admin1 = authed(await login(ADMIN1));
  check("El vendedor entra y ve sus datos", (await vend.query(api.users.currentUser, {}))?.email === VEND);

  // 1) Permisos
  const e1 = await errOf(vend.mutation(api.users.deactivateUser, { userId: ids[ADMIN1] }));
  check("Un vendedor no puede desactivar a nadie", Boolean(e1?.includes("Solo un administrador")));
  const e2 = await errOf(admin1.mutation(api.users.deactivateUser, { userId: ids[ADMIN1] }));
  check("Nadie puede desactivarse a sí mismo", Boolean(e2?.includes("propia cuenta")));
  const e3 = await errOf(anon().mutation(api.users.deactivateUser, { userId: ids[VEND] }));
  check("Sin sesión no se puede desactivar", Boolean(e3));

  // 2) Atomicidad: falla a media desactivación → no cambia nada
  run("testHelpers:setSmokeResetCode", { email: VEND, codeHash: hash(VEND, "13572468"), expiresAt: Date.now() + 600000 });
  setFailpoint("deactivate_after_sessions");
  await sleep(2000);
  const e4 = await errOf(admin1.mutation(api.users.deactivateUser, { userId: ids[VEND] }));
  setFailpoint(null);
  await sleep(2000);
  const afterFail = smoke()[VEND];
  check("Falla a media desactivación: la mutation falla", Boolean(e4));
  check("…y no queda nada a medias (sesión, Google y código intactos; sigue activa)",
    afterFail.sessions === 1 && afterFail.accounts.some((a) => a.startsWith("google:")) &&
    run("testHelpers:dumpSmokeReset", { email: VEND }).codes.length === 1 &&
    (await vend.query(api.users.currentUser, {}))?.email === VEND);

  // 3) Desactivar
  await admin1.mutation(api.users.deactivateUser, { userId: ids[VEND] });
  const after = smoke()[VEND];
  check("Desactivar cierra todas sus sesiones", after.sessions === 0);
  check("Desactivar quita la vinculación con Google y conserva la contraseña", !after.accounts.some((a) => a.startsWith("google:")) && after.accounts.some((a) => a.startsWith("password:")));
  check("Desactivar borra sus códigos de recuperación pendientes", run("testHelpers:dumpSmokeReset", { email: VEND }).codes.length === 0);
  check("La sesión que ya tenía abierta deja de ver datos de inmediato", (await vend.query(api.users.currentUser, {})) === null);
  const e5 = await errOf(vend.query(api.prospects.list, {}));
  check("…y las queries del CRM la rechazan", Boolean(e5?.includes("No autenticado")));
  const team = await admin1.query(api.users.listTeam, {});
  check("Equipo muestra la cuenta como desactivada", Boolean(team.find((m) => m._id === ids[VEND])?.disabledAt));
  check("Desactivar dos veces no falla (idempotente)", !(await errOf(admin1.mutation(api.users.deactivateUser, { userId: ids[VEND] }))));

  // 4) No puede entrar ni recuperar la contraseña
  const e6 = await errOf(login(VEND));
  check("Con su contraseña correcta ya no puede entrar (cuenta desactivada)", Boolean(e6?.includes("desactivada")), e6?.slice(0, 80));
  check("…y el intento no crea ninguna sesión", smoke()[VEND].sessions === 0);
  run("testHelpers:setSmokeResetCode", { email: VEND, codeHash: hash(VEND, "24681357"), expiresAt: Date.now() + 600000 });
  const r = await anon().mutation(api.passwordReset.confirm, { email: VEND, code: "24681357", newPassword: randomBytes(12).toString("base64url") });
  check("Un código de recuperación válido no le sirve (misma respuesta genérica)", r.ok === false && r.reason === "INVALID_CODE");
  await anon().action(api.passwordReset.request, { email: VEND, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }); // ICS-123
  await sleep(4000);
  check("Pedir un código para una cuenta desactivada no genera ninguno", run("testHelpers:dumpSmokeReset", { email: VEND }).codes.length === 0);
  const e7 = await errOf(admin1.action(api.users.resetUserPassword, { userId: ids[VEND] }));
  check("La administradora no puede restablecer la contraseña de una cuenta desactivada", Boolean(e7?.includes("desactivada")));

  // 5) Reactivar
  const e8 = await errOf(vend.mutation(api.users.reactivateUser, { userId: ids[VEND] }));
  check("Un usuario sin sesión válida no puede reactivar", Boolean(e8));
  await admin1.mutation(api.users.reactivateUser, { userId: ids[VEND] });
  const vend2 = authed(await login(VEND));
  check("Reactivada: entra con su contraseña de siempre", (await vend2.query(api.users.currentUser, {}))?.email === VEND);
  check("Reactivar no restaura Google ni la sesión vieja",
    !smoke()[VEND].accounts.some((a) => a.startsWith("google:")) && (await vend.query(api.users.currentUser, {})) === null);

  // 6) Dos administradoras se desactivan una a otra al mismo tiempo
  const a1 = authed(await login(ADMIN1));
  const a2 = authed(await login(ADMIN2));
  const results = await Promise.allSettled([
    a1.mutation(api.users.deactivateUser, { userId: ids[ADMIN2] }),
    a2.mutation(api.users.deactivateUser, { userId: ids[ADMIN1] }),
  ]);
  const ok = results.filter((x) => x.status === "fulfilled").length;
  const team2 = await (ok && results[0].status === "fulfilled" ? a1 : a2).query(api.users.listTeam, {});
  const active = [ids[ADMIN1], ids[ADMIN2]].filter((id) => !team2.find((m) => m._id === id)?.disabledAt);
  check("Desactivación mutua simultánea: solo una gana y queda una administradora activa", ok === 1 && active.length === 1,
    `${ok} aceptada(s), ${active.length} activa(s)`);
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
