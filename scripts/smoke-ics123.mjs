// Smoke test de ICS-123 (Cloudflare Turnstile en "Olvidé mi contraseña") —
// backend. Llama la API pública de Convex directo, como lo haría un atacante
// sin pasar por la pantalla, contra el deployment de DESARROLLO.
//
// En dev se usan las llaves de prueba oficiales de Cloudflare: con
// TURNSTILE_SECRET_KEY=1x…AA cualquier token aprueba; 2x…AA siempre rechaza;
// 3x…AA responde "timeout-or-duplicate" (vencido o ya usado). La prueba cambia
// temporalmente variables de entorno de dev y al final restaura los valores
// que tenían al empezar (o las quita si no existían).
//
// Comprueba: la mutation vieja sin captcha ya no es pública; sin token, con
// token rechazado, vencido/usado, de otro dominio o con llave de prueba no
// permitida → error claro y NADA agendado; con token válido → misma respuesta
// de siempre y la solicitud se registra.
//
// USO (se niega a correr contra producción):
//   node scripts/smoke-ics123.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { convexRun } from "./convex-run.mjs";
import { errorMessage } from "../src/lib/errors.js";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const EMAIL = "delivered+ics123@resend.dev";
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const PASS_KEY = "1x0000000000000000000000000000000AA";
const FAIL_KEY = "2x0000000000000000000000000000000AA";
const SPENT_KEY = "3x0000000000000000000000000000000AA";
const MSG = "No pudimos comprobar que eres una persona. Vuelve a marcar la verificación e intenta de nuevo.";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun;
const setEnv = (name, value) =>
  execFileSync("npx", value === null ? ["convex", "env", "remove", name] : ["convex", "env", "set", name, value], { stdio: "ignore" });
/** Valor actual de una variable de dev, o null si no existe (se restaura tal cual al final). */
function getEnv(name) {
  try {
    const out = execFileSync("npx", ["convex", "env", "get", name], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}
const TURNSTILE_VARS = ["TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES", "TURNSTILE_ALLOW_TEST_KEYS"];
const originalEnv = Object.fromEntries(TURNSTILE_VARS.map((k) => [k, getEnv(k)]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anon = () => new ConvexHttpClient(DEV_URL);
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
const request = (turnstileToken) => anon().action(api.passwordReset.request, { email: EMAIL, ...(turnstileToken === undefined ? {} : { turnstileToken }) });
const requests = () => run("testHelpers:dumpSmokeReset", { email: EMAIL }).requests;

async function expectRejected(label, turnstileToken) {
  const before = requests();
  const e = await caught(request(turnstileToken));
  await sleep(3000);
  check(label, errorMessage(e, "") === MSG && requests() === before, `${errorMessage(e, "—").slice(0, 60)} | solicitudes ${before}→${requests()}`);
}

try {
  // La prueba necesita las llaves de prueba de Cloudflare; si dev tenía otras, las restaura al final.
  setEnv("TURNSTILE_SECRET_KEY", PASS_KEY);
  setEnv("TURNSTILE_ALLOWED_HOSTNAMES", "example.com");
  setEnv("TURNSTILE_ALLOW_TEST_KEYS", "true");
  await sleep(2500);
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: EMAIL, role: "vendedor" });
  run("users:provisionPassword", { email: EMAIL, password: "contraseña-de-prueba-larga" });

  check("La mutation vieja sin captcha ya no es pública", Boolean(await caught(anon().mutation(api.passwordReset.request, { email: EMAIL }))));
  await expectRejected("Sin token: rechazado y no se agenda nada", undefined);
  await expectRejected("Token vacío: rechazado", "");

  const before = requests();
  const ok = await request(TOKEN);
  await sleep(4000);
  check("Token válido: misma respuesta de siempre (null) y la solicitud se registra", ok === null && requests() === before + 1, `${before}→${requests()}`);

  setEnv("TURNSTILE_SECRET_KEY", FAIL_KEY); await sleep(2500);
  await expectRejected("Token rechazado por Cloudflare: rechazado", TOKEN);
  setEnv("TURNSTILE_SECRET_KEY", SPENT_KEY); await sleep(2500);
  await expectRejected("Token vencido o ya usado (timeout-or-duplicate): rechazado", TOKEN);
  setEnv("TURNSTILE_SECRET_KEY", PASS_KEY);
  setEnv("TURNSTILE_ALLOWED_HOSTNAMES", "crm.icsaab.com"); await sleep(2500);
  await expectRejected("Token de otro dominio: rechazado", TOKEN);
  setEnv("TURNSTILE_ALLOWED_HOSTNAMES", "example.com");
  setEnv("TURNSTILE_ALLOW_TEST_KEYS", null); await sleep(2500);
  await expectRejected("Llave de prueba sin permiso (como en producción): rechazado", TOKEN);
  setEnv("TURNSTILE_ALLOW_TEST_KEYS", "true");
  setEnv("TURNSTILE_SECRET_KEY", null); await sleep(2500);
  await expectRejected("Sin llave secreta configurada: falla cerrada", TOKEN);
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  // Restaurar el entorno de dev. Si falla (p. ej. sin conexión), avisarlo en grande: una llave
  // que siempre rechaza dejaría "Olvidé mi contraseña" inservible en dev (ya pasó una vez).
  const notRestored = [];
  for (const k of TURNSTILE_VARS) {
    const v = originalEnv[k];
    try { setEnv(k, v); } catch { notRestored.push(v === null ? `npx convex env remove ${k}` : `npx convex env set ${k} ${v}`); }
  }
  if (notRestored.length) {
    failures++;
    console.log(`\n⚠️  NO SE PUDO RESTAURAR EL ENTORNO DE DEV. Corre a mano:\n   ${notRestored.join("\n   ")}\n`);
  } else {
    console.log("Entorno de dev restaurado.");
  }
  try {
    console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
  } catch (e) {
    failures++;
    console.log(`⚠️  La limpieza falló; borra a mano los datos de prueba con: npx convex run testHelpers:deleteSmokeAuthUsers — ${e.message.slice(0, 120)}`);
  }
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
