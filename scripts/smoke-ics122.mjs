// Smoke test de ICS-122 (proveedor de contraseña propio) — backend. Contra el
// deployment de DESARROLLO, con la API pública de Convex Auth (`auth:signIn`),
// como la llamaría cualquiera sin pasar por la pantalla.
//
// Comprueba: las contraseñas existentes siguen entrando; el correo no
// distingue mayúsculas ni espacios; contraseña equivocada y correo
// inexistente responden igual y tardan parecido (hash ficticio); `signUp`,
// `reset` y `email-verification` no existen (ni crean ni cambian nada); el
// bloqueo por intentos sigue y la recuperación por código lo limpia; una
// invitación con mayúsculas guarda la credencial en minúsculas.
//
// USO (se niega a correr contra producción):
//   node scripts/smoke-ics122.mjs
//
// DATOS
//   Cuentas delivered+ics122*@resend.dev; se borran al final, incluso si falla.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { convexRun } from "./convex-run.mjs";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const VEND = "delivered+ics122@resend.dev";
const ADMIN = "delivered+ics122-admin@resend.dev";
const GHOST = "delivered+nadie-ics122@resend.dev";
const INVITE = "Delivered+ICS122-Invitada@Resend.dev";
const pass = { [VEND]: randomBytes(12).toString("base64url"), [ADMIN]: randomBytes(12).toString("base64url") };

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun; // nunca imprime los argumentos si falla
const anon = () => new ConvexHttpClient(DEV_URL);
const signIn = (params) => anon().action(api.auth.signIn, { provider: "password", params });
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
/** El motivo que da el servidor, sin el Request ID (cambia en cada llamada). */
const reasonOf = (e) => String(e?.message ?? "").replace(/\[Request ID: [^\]]+\]/g, "").replace(/\s+/g, " ").trim();
const canLogin = async (email, password) => !(await caught(signIn({ email, password, flow: "signIn" })));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function timed(fn) { const t = performance.now(); await fn().catch(() => {}); return performance.now() - t; }
const smoke = () => run("testHelpers:dumpSmokeAuth");

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  for (const email of [VEND, ADMIN]) run("users:provisionPassword", { email, password: pass[email] });

  // Cuentas existentes y correo sin distinguir mayúsculas
  check("Una cuenta existente entra con su contraseña", await canLogin(VEND, pass[VEND]));
  check("…también con mayúsculas y espacios en el correo", await canLogin("  Delivered+ICS122@Resend.DEV ", pass[VEND]));

  // Respuestas iguales
  const eWrong = await caught(signIn({ email: VEND, password: "contraseña-equivocada", flow: "signIn" }));
  const eGhost = await caught(signIn({ email: GHOST, password: "contraseña-equivocada", flow: "signIn" }));
  check("Contraseña equivocada y correo inexistente responden igual",
    Boolean(eWrong && eGhost) && reasonOf(eWrong) === reasonOf(eGhost), `${reasonOf(eWrong).slice(0, 70)} | ${reasonOf(eGhost).slice(0, 70)}`);

  // Tiempos parecidos (calentado, medianas de mediciones alternadas; pocos intentos para no tocar el límite de 10)
  await timed(() => signIn({ email: GHOST, password: "x", flow: "signIn" }));
  const tWrong = [], tGhost = [];
  for (let i = 0; i < 4; i++) {
    tGhost.push(await timed(() => signIn({ email: GHOST, password: "contraseña-equivocada", flow: "signIn" })));
    tWrong.push(await timed(() => signIn({ email: VEND, password: "contraseña-equivocada", flow: "signIn" })));
  }
  check("Tardan parecido (no revela qué correos tienen cuenta)", Math.abs(median(tWrong) - median(tGhost)) < 250,
    `medianas ${median(tWrong).toFixed(0)} ms / ${median(tGhost).toFixed(0)} ms`);
  check("Un login correcto sigue entrando tras los fallos (y limpia el contador)", await canLogin(VEND, pass[VEND]));

  // Flujos que ya no existen
  const before = smoke();
  const eUp = await caught(signIn({ email: "delivered+ics122-registro@resend.dev", password: "contraseña-larga-x", flow: "signUp" }));
  const eUpExisting = await caught(signIn({ email: VEND, password: "otra-contraseña-larga", flow: "signUp" }));
  const eReset = await caught(signIn({ email: VEND, flow: "reset" }));
  const eVerify = await caught(signIn({ email: VEND, code: "12345678", flow: "email-verification" }));
  const after = smoke();
  check("signUp, reset y email-verification se rechazan", [eUp, eUpExisting, eReset, eVerify].every(Boolean));
  check("…sin crear usuarios ni credenciales", after.totalUsers === before.totalUsers &&
    JSON.stringify(after.smoke.map((u) => u.accounts)) === JSON.stringify(before.smoke.map((u) => u.accounts)));
  check("…y un signUp a una cuenta existente no le cambia la contraseña", (await canLogin(VEND, pass[VEND])) && !(await canLogin(VEND, "otra-contraseña-larga")));

  // Bloqueo por intentos y recuperación por código
  for (let i = 0; i < 10; i++) await caught(signIn({ email: VEND, password: "equivocada", flow: "signIn" }));
  check("Tras 10 fallos, ni la contraseña correcta entra (el bloqueo sigue)", !(await canLogin(VEND, pass[VEND])));
  run("testHelpers:setSmokeResetCode", { email: VEND, codeHash: createHash("sha256").update(`${VEND}:12345678`).digest("hex"), expiresAt: Date.now() + 600000 });
  const newPass = randomBytes(12).toString("base64url");
  const r = await anon().mutation(api.passwordReset.confirm, { email: VEND, code: "12345678", newPassword: newPass });
  check("Recuperar con código desbloquea: entra con la contraseña nueva", r.ok && (await canLogin(VEND, newPass)) && run("testHelpers:smokePasswordAttempts", { email: VEND }) === null);

  // Invitación con mayúsculas → credencial en minúsculas
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email: ADMIN, password: pass[ADMIN], flow: "signIn" } });
  const admin = new ConvexHttpClient(DEV_URL);
  admin.setAuth(res.tokens.token);
  const { tempPassword } = await admin.action(api.users.inviteUser, { email: INVITE, name: "Invitada", role: "vendedor" });
  const invited = smoke().smoke.find((u) => u.email === INVITE);
  check("Una invitación con mayúsculas guarda la credencial en minúsculas", invited?.accounts.includes(`password:${INVITE.toLowerCase()}`), JSON.stringify(invited?.accounts));
  check("…y la invitada entra con el correo como lo escriba", (await canLogin(INVITE, tempPassword)) && (await canLogin(INVITE.toLowerCase(), tempPassword)));

  // Migración
  const m = run("migrations:normalizePasswordAccountIds", { dryRun: true });
  check("La migración no encuentra credenciales con mayúsculas ni colisiones", m.toChange === 0 && m.collisions.length === 0, JSON.stringify(m));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
