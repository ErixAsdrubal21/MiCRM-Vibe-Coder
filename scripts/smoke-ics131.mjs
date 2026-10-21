// Smoke test de ICS-131 (editar nombre y correo de un miembro) — backend.
// Contra el deployment de DESARROLLO, con sesiones reales de Convex Auth.
//
// Comprueba: cada persona cambia su propio nombre y la administradora el de
// cualquiera; el correo solo lo cambia una administradora y nunca el suyo
// desde la app; correo inválido o ya usado (sin distinguir mayúsculas) se
// rechaza; cambiar el correo mueve el acceso con contraseña al correo nuevo,
// quita Google, cierra sesiones, invalida códigos de recuperación del correo
// viejo, avisa a las dos direcciones y queda en la bitácora; una falla
// simulada a media operación no cambia nada; el script de soporte aplica las
// mismas reglas.
//
// USO (se niega a correr contra producción; usa `npx convex env set/remove
// TEST_FAILPOINT` en dev y la borra al final):
//   node scripts/smoke-ics131.mjs
//
// DATOS
//   Cuentas delivered+ics131*@resend.dev; se borran al final, incluso si falla.

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

const VEND = "delivered+ics131@resend.dev";
const VEND_NEW = "delivered+ics131-nuevo@resend.dev";
const VEND_SCRIPT = "delivered+ics131-script@resend.dev";
const ADMIN = "delivered+ics131-admin@resend.dev";
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
const canLogin = async (email, password) => !(await caught(loginWith(email, password)));
const smoke = () => run("testHelpers:dumpSmokeAuth").smoke;
const byId = (id) => smoke().find((u) => u._id === id);
const emailEvents = (email) => run("testHelpers:smokeSecurityEvents", { email }).filter((e) => e.type === "email_changed");
const codesFor = (email) => run("testHelpers:dumpSmokeReset", { email }).codes.length;

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  for (const email of [VEND, ADMIN]) run("users:provisionPassword", { email, password: pass[email] });
  const ids = Object.fromEntries(smoke().map((u) => [u.email, u._id]));
  const admin = await loginWith(ADMIN, pass[ADMIN]);
  const vend = await loginWith(VEND, pass[VEND]);

  // Nombre
  await vend.mutation(api.users.updateOwnName, { name: "  Vendedora Nueva  " });
  check("Cada persona cambia su propio nombre (sin espacios sobrantes)", (await vend.query(api.users.currentUser, {}))?.name === "Vendedora Nueva");
  check("Nombre vacío se rechaza con mensaje claro", errorMessage(await caught(vend.mutation(api.users.updateOwnName, { name: "   " })), "") === "El nombre no puede estar vacío.");
  check("Nombre de más de 80 caracteres se rechaza", errorMessage(await caught(vend.mutation(api.users.updateOwnName, { name: "x".repeat(81) })), "").includes("80 caracteres"));
  const e1 = await caught(vend.mutation(api.users.updateMember, { userId: ids[ADMIN], name: "Hackeada" }));
  check("Un vendedor no puede editar a otros", errorMessage(e1, "").startsWith("Solo un administrador"));
  await admin.mutation(api.users.updateMember, { userId: ids[VEND], name: "Nombre Por Admin" });
  check("La administradora cambia el nombre de un miembro", byId(ids[VEND])?.accounts && (await vend.query(api.users.currentUser, {}))?.name === "Nombre Por Admin");
  await admin.mutation(api.users.updateMember, { userId: ids[ADMIN], name: "Admin Renombrada" });
  check("…y el suyo propio", (await admin.query(api.users.currentUser, {}))?.name === "Admin Renombrada");
  check("Cambiar solo el nombre no cierra sesiones ni deja evento", Boolean(await vend.query(api.users.currentUser, {})) && emailEvents(VEND).length === 0);

  // Reglas del correo
  const e2 = await caught(admin.mutation(api.users.updateMember, { userId: ids[ADMIN], email: "otra@resend.dev" }));
  check("La administradora no cambia su propio correo desde la app", errorMessage(e2, "").startsWith("Tu propio correo no se cambia desde aquí"));
  check("Correo inválido se rechaza", errorMessage(await caught(admin.mutation(api.users.updateMember, { userId: ids[VEND], email: "no-es-correo" })), "") === "Escribe un correo válido.");
  check("Correo ya usado (con otras mayúsculas) se rechaza",
    errorMessage(await caught(admin.mutation(api.users.updateMember, { userId: ids[VEND], email: ADMIN.toUpperCase() })), "") === "Ya existe una cuenta con ese correo.");

  // Preparar: Google permitido y vinculado, código de recuperación pendiente, sesión abierta
  await admin.mutation(api.users.setGoogleAllowed, { userId: ids[VEND], allowed: true });
  run("testHelpers:insertSmokeGoogleAccount", { email: VEND });
  run("testHelpers:setSmokeResetCode", { email: VEND, codeHash: createHash("sha256").update(`${VEND}:12345678`).digest("hex"), expiresAt: Date.now() + 600000 });

  // Falla a media operación → nada cambia
  setFailpoint("email_change_after_patch");
  await sleep(2000);
  const e3 = await caught(admin.mutation(api.users.updateMember, { userId: ids[VEND], email: VEND_NEW }));
  setFailpoint(null);
  await sleep(2000);
  const s3 = byId(ids[VEND]);
  check("Falla simulada a media operación: falla y no cambia nada (correo, Google, código, sesión, bitácora)",
    Boolean(e3) && s3.email === VEND && s3.googleAllowed && s3.accounts.some((a) => a.startsWith("google:")) &&
    codesFor(VEND) === 1 && Boolean(await vend.query(api.users.currentUser, {})) && emailEvents(VEND).length === 0);

  // Cambio de correo (los trabajos agendados de corridas anteriores siguen un tiempo: se mide la diferencia)
  const noticesBefore = run("testHelpers:countSmokeEmailChangeNotices", { newEmail: VEND_NEW });
  await admin.mutation(api.users.updateMember, { userId: ids[VEND], email: "  Delivered+ICS131-Nuevo@resend.dev " });
  const s4 = byId(ids[VEND]);
  check("El correo cambia, normalizado a minúsculas", s4.email === VEND_NEW && s4.accounts.includes(`password:${VEND_NEW}`));
  check("Quita Google (vinculación y permiso)", !s4.googleAllowed && !s4.accounts.some((a) => a.startsWith("google:")));
  check("Cierra sus sesiones", (await vend.query(api.users.currentUser, {})) === null && s4.sessions === 0);
  check("El código de recuperación del correo viejo deja de servir",
    codesFor(VEND) === 0 && (await anon().mutation(api.passwordReset.confirm, { email: VEND, code: "12345678", newPassword: "contraseña-larga-x" })).ok === false);
  check("Avisa a las dos direcciones (aviso agendado)", run("testHelpers:countSmokeEmailChangeNotices", { newEmail: VEND_NEW }) === noticesBefore + 1);
  const ev = emailEvents(VEND_NEW);
  check("Queda en la bitácora, hecho por la administradora y sin guardar los correos",
    ev.length === 1 && ev[0].actorId === ids[ADMIN] && ev[0].details?.googleRemoved === true && !JSON.stringify(ev[0]).includes("@"));
  check("Con la misma contraseña entra con el correo nuevo y ya no con el viejo",
    (await canLogin(VEND_NEW, pass[VEND])) && !(await canLogin(VEND, pass[VEND])));

  // Script de soporte
  const r = run("users:changeUserEmail", { from: VEND_NEW, to: VEND_SCRIPT });
  const ev2 = emailEvents(VEND_SCRIPT);
  check("El script de soporte aplica las mismas reglas y queda marcado como script",
    r.email === VEND_SCRIPT && ev2.length === 2 && ev2[1].details?.via === "script" && !ev2[1].actorId && (await canLogin(VEND_SCRIPT, pass[VEND])));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
