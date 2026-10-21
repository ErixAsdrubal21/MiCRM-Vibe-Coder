// Smoke test de ICS-120 (cambio y restablecimiento de contraseña atómicos) —
// backend. Contra el deployment de DESARROLLO, con sesiones reales de Convex
// Auth:
//
// - changeOwnPassword: contraseña actual equivocada → no cambia nada y suma
//   al límite de intentos (compartido con el login); éxito → contraseña
//   nueva, códigos de recuperación borrados, demás sesiones cerradas y la
//   actual sigue; falla simulada a media operación → nada cambia.
// - resetUserPassword: solo administradora; éxito → temporal, Google
//   quitado, todas las sesiones cerradas, códigos borrados y contador de
//   intentos limpio; falla simulada → nada cambia y no se entrega temporal.
//
// USO (se niega a correr contra producción; usa `npx convex env set/remove
// TEST_FAILPOINT` en dev y la borra al final):
//   node scripts/smoke-ics120.mjs
//
// DATOS
//   Cuentas delivered+ics120*@resend.dev; se borran al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { errorMessage } from "../src/lib/errors.js";
import { convexRun } from "./convex-run.mjs";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const VEND = "delivered+ics120@resend.dev";
const ADMIN = "delivered+ics120-admin@resend.dev";
const pass = { [VEND]: randomBytes(12).toString("base64url"), [ADMIN]: randomBytes(12).toString("base64url") };

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun; // nunca imprime los argumentos si falla (scripts/convex-run.mjs)
const setFailpoint = (name) =>
  execFileSync("npx", name ? ["convex", "env", "set", "TEST_FAILPOINT", name] : ["convex", "env", "remove", "TEST_FAILPOINT"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = () => new ConvexHttpClient(DEV_URL);
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
async function loginWith(email, password) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email, password, flow: "signIn" } });
  const c = new ConvexHttpClient(DEV_URL);
  c.setAuth(res.tokens.token);
  return c;
}
const login = (email) => loginWith(email, pass[email]);
const canLogin = async (email, password) => !(await caught(loginWith(email, password)));
const sees = async (client) => Boolean(await client.query(api.users.currentUser, {}));
const state = () => run("testHelpers:dumpSmokeAuth").smoke.find((u) => u.email === VEND);
const codes = () => run("testHelpers:dumpSmokeReset", { email: VEND }).codes.length;
const attempts = () => run("testHelpers:smokePasswordAttempts", { email: VEND });
const setCode = () => run("testHelpers:setSmokeResetCode", {
  email: VEND, codeHash: createHash("sha256").update(`${VEND}:12345678`).digest("hex"), expiresAt: Date.now() + 600000,
});
const change = (client, currentPassword, newPassword) => client.action(api.users.changeOwnPassword, { currentPassword, newPassword });

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  for (const email of [VEND, ADMIN]) run("users:provisionPassword", { email, password: pass[email] });
  const vendId = state()._id;
  const admin = await login(ADMIN);

  // --- Cambio de la propia contraseña ---
  let me = await login(VEND);
  const other = await login(VEND);
  setCode();

  const e1 = await caught(change(me, "contraseña-equivocada", "nueva-contraseña-larga"));
  check("Contraseña actual equivocada: mensaje claro", errorMessage(e1, "") === "La contraseña actual no es correcta.", errorMessage(e1, "—"));
  // El contador se revisa antes de cualquier login de la prueba: un login correcto lo reinicia.
  const left = attempts();
  check("…suma al límite de intentos compartido con el login", typeof left === "number" && left < 10, `quedan ${left}`);
  check("…y no cambia nada (sigue la contraseña de siempre, el código y la otra sesión)",
    (await canLogin(VEND, pass[VEND])) && codes() === 1 && (await sees(other)));

  const e2 = await caught(change(me, pass[VEND], "corta"));
  check("Contraseña nueva demasiado corta: mensaje claro", errorMessage(e2, "") === "La nueva contraseña debe tener entre 8 y 128 caracteres.");

  // Falla a media operación → nada cambia
  setFailpoint("change_own_after_password");
  await sleep(2000);
  const e3 = await caught(change(me, pass[VEND], "nueva-contraseña-larga"));
  setFailpoint(null);
  await sleep(2000);
  check("Falla simulada a media operación: falla", Boolean(e3));
  check("…y no queda nada a medias (contraseña, código y otra sesión intactos)",
    (await canLogin(VEND, pass[VEND])) && !(await canLogin(VEND, "nueva-contraseña-larga")) && codes() === 1 && (await sees(other)));

  // Éxito
  const newPass = randomBytes(12).toString("base64url");
  await caught(change(me, "contraseña-equivocada", "x-contraseña-larga")); // deja un intento registrado
  await change(me, pass[VEND], newPass);
  check("Éxito: limpia el contador de intentos", attempts() === null);
  check("…borra los códigos de recuperación pendientes", codes() === 0);
  check("…cierra las demás sesiones y la actual sigue abierta", !(await sees(other)) && (await sees(me)));
  check("…la contraseña nueva entra y la anterior ya no", (await canLogin(VEND, newPass)) && !(await canLogin(VEND, pass[VEND])));
  pass[VEND] = newPass;

  // Límite de intentos: 10 equivocados bloquean también el intento correcto (y el login)
  for (let i = 0; i < 10; i++) await caught(change(me, "contraseña-equivocada", "otra-contraseña-larga"));
  const e4 = await caught(change(me, pass[VEND], "otra-contraseña-larga"));
  check("Tras 10 intentos equivocados, ni la contraseña correcta pasa", errorMessage(e4, "").startsWith("Demasiados intentos"), errorMessage(e4, "—"));
  check("…y el login también queda bloqueado (mismo contador)", !(await canLogin(VEND, pass[VEND])));

  // --- Restablecimiento por la administradora ---
  const e5 = await caught(me.action(api.users.resetUserPassword, { userId: vendId }));
  check("Un vendedor no puede restablecer contraseñas", errorMessage(e5, "") === "Solo un administrador puede restablecer contraseñas.", errorMessage(e5, "—"));

  await admin.mutation(api.users.setGoogleAllowed, { userId: vendId, allowed: true });
  run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  setCode();
  setFailpoint("admin_reset_after_password");
  await sleep(2000);
  const e6 = await caught(admin.action(api.users.resetUserPassword, { userId: vendId }));
  setFailpoint(null);
  await sleep(2000);
  const s6 = state();
  check("Falla simulada en el restablecimiento: falla y no entrega contraseña temporal", Boolean(e6));
  check("…y no queda nada a medias (Google, sesión, código y contador intactos)",
    s6.googleAllowed && s6.accounts.some((a) => a.startsWith("google:")) && (await sees(me)) && codes() === 1 && attempts() !== null);

  const { tempPassword } = await admin.action(api.users.resetUserPassword, { userId: vendId });
  const s7 = state();
  check("Éxito: desbloquea el contador de intentos", attempts() === null);
  check("…quita Google (vinculación y permiso)", !s7.googleAllowed && !s7.accounts.some((a) => a.startsWith("google:")));
  check("…cierra todas sus sesiones", !(await sees(me)));
  check("…borra los códigos de recuperación pendientes", codes() === 0);
  check("…la temporal entra y la anterior ya no", (await canLogin(VEND, tempPassword)) && !(await canLogin(VEND, pass[VEND])));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
