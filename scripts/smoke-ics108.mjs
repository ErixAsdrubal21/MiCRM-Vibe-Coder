// Smoke test de ICS-108 (login con Google solo para cuentas aprovisionadas).
// Sin navegador ni Google: recorre la misma ruta interna que el callback
// OAuth de Convex Auth (`auth:store` verifier → verifierSignature →
// userOAuth → verifyCodeAndSignIn), así que ejercita `createOrUpdateUser`
// (convex/auth.js) exactamente como lo haría un regreso real de Google.
// Lo único que NO cubre es el intercambio HTTP con Google; el filtro
// `email_verified` se prueba aparte llamando `googleProfileOrReject`.
// Desde ICS-118 la cuenta además necesita `googleAllowed`: se comprueba que
// sin él se rechaza, se permite con users:setGoogleAllowedByEmail y, al
// final, que quitarlo rechaza también la vinculación ya existente.
// ICS-119: la regla de dominios (Gmail o Workspace autorizado) se prueba con
// `googleProfileOrReject` y una lista explícita; el aviso por correo de una
// vinculación nueva, con los trabajos agendados (testHelpers:countSmokeGoogleNotices).
//
// USO (contra el deployment de DESARROLLO; `npx convex run` usa el de
// .env.local — nunca correr con --prod):
//   node scripts/smoke-ics108.mjs
//
// DATOS
//   Crea filas `users` con correos `smoke-ics108…` y las borra al final
//   (incluso si falla) con testHelpers:deleteSmokeAuthUsers.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { googleProfileOrReject } from "../convex/auth.js";
import { convexRun } from "./convex-run.mjs";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const run = convexRun; // nunca imprime los argumentos si falla (scripts/convex-run.mjs)

function runFails(fn, args) {
  try {
    run(fn, args);
    return null;
  } catch (err) {
    return String(err.stderr || err.message);
  }
}

const store = (args) => run("auth:store", { args });

/** Regreso de Google simulado: devuelve el userId con sesión, o lanza si se rechaza. */
function googleSignIn(email, sub) {
  const verifier = store({ type: "verifier" });
  const signature = randomBytes(16).toString("hex");
  store({ type: "verifierSignature", verifier, signature });
  const code = store({
    type: "userOAuth",
    provider: "google",
    providerAccountId: sub,
    profile: { email, name: "[SMOKE ICS-108]" },
    signature,
  });
  const result = store({
    type: "verifyCodeAndSignIn",
    params: { code },
    verifier,
    provider: "google",
    generateTokens: false,
    allowExtraProviders: false,
  });
  return result?.userId ?? null;
}

function googleRejected(email, sub) {
  try {
    googleSignIn(email, sub);
    return false;
  } catch {
    return true;
  }
}

const dump = () => run("testHelpers:dumpSmokeAuth");
const byEmail = (email) => dump().smoke.find((u) => u.email === email);

const INVITED = "Smoke-ICS108-Persona@Example.com";
const password = randomBytes(12).toString("base64url");

try {
  run("testHelpers:deleteSmokeAuthUsers");
  const baseline = dump().totalUsers;

  // email_verified
  check("Perfil de Google sin correo verificado se rechaza", (() => {
    try {
      googleProfileOrReject({ sub: "x", email: "a@b.com", email_verified: false });
      return false;
    } catch {
      return true;
    }
  })());
  check(
    "Perfil verificado normaliza el correo a minúsculas",
    googleProfileOrReject({ sub: "x", email: " Ana@Gmail.com ", email_verified: true }, []).email === "ana@gmail.com",
  );

  // ICS-119: dominios
  const accepts = (profile, domains) => { try { googleProfileOrReject({ sub: "x", email_verified: true, ...profile }, domains); return true; } catch { return false; } };
  check("ICS-119: Gmail personal se acepta", accepts({ email: "ana@gmail.com" }, []));
  check("ICS-119: Workspace con dominio autorizado se acepta", accepts({ email: "esalas@icsaab.com", hd: "icsaab.com" }, ["icsaab.com"]));
  check("ICS-119: Workspace de un dominio no autorizado se rechaza", !accepts({ email: "ana@otra.com", hd: "otra.com" }, ["icsaab.com"]));
  check("ICS-119: cuenta de Google con correo de otro dominio y sin hd se rechaza", !accepts({ email: "esalas@icsaab.com" }, ["icsaab.com"]));
  check("ICS-119: sin lista de dominios, Workspace se rechaza (solo Gmail)", !accepts({ email: "esalas@icsaab.com", hd: "icsaab.com" }, []));
  check("ICS-119: un hd falso no convierte en Gmail", !accepts({ email: "ana@gmail.com", hd: "otra.com" }, ["icsaab.com"]));

  // M1: invitado con mayúsculas (flujo real de inviteUser) entra con Google en minúsculas
  const invitedId = run("users:createPendingUserRow", { email: INVITED, name: "[SMOKE ICS-108]", role: "vendedor" });
  run("users:provisionPassword", { email: INVITED, password });
  check("ICS-118: sin permiso de Google, el regreso de Google se rechaza", googleRejected(INVITED.toLowerCase(), "smoke-sub-persona"));
  check("…y no crea la vinculación", !byEmail(INVITED)?.accounts.some((a) => a.startsWith("google:")));
  check("ICS-119: un login rechazado no agenda aviso", run("testHelpers:countSmokeGoogleNotices", { email: INVITED }) === 0);
  run("users:setGoogleAllowedByEmail", { email: INVITED, allowed: true });
  const googleUserId = googleSignIn(INVITED.toLowerCase(), "smoke-sub-persona");
  check("Google en minúsculas vincula al invitado con mayúsculas", googleUserId === invitedId, `${googleUserId} vs ${invitedId}`);
  const persona = byEmail(INVITED);
  check("Conserva _id y rol", persona?._id === invitedId && persona?.role === "vendedor");
  check(
    "Queda con cuentas password + google y una sesión",
    persona?.accounts.includes(`password:${INVITED}`) && persona?.accounts.includes("google:smoke-sub-persona") && persona?.sessions >= 1,
    JSON.stringify(persona),
  );
  check("ICS-119: la vinculación nueva agenda un aviso por correo", run("testHelpers:countSmokeGoogleNotices", { email: INVITED }) === 1);
  check("Segundo login con Google reutiliza la vinculación", googleSignIn(INVITED.toLowerCase(), "smoke-sub-persona") === invitedId);
  check("ICS-119: …y no vuelve a enviar el aviso", run("testHelpers:countSmokeGoogleNotices", { email: INVITED }) === 1);

  // No autorizado
  check("Correo no aprovisionado se rechaza", googleRejected("smoke-ics108-nadie@example.com", "smoke-sub-nadie"));
  check("…y no crea usuario", !byEmail("smoke-ics108-nadie@example.com"));

  // Sin rol: el esquema de `users` exige `role`, así que una fila así no puede existir
  check(
    "El esquema rechaza una fila de users sin rol",
    /missing the required field `role`/.test(
      runFails("testHelpers:insertSmokeAuthUser", { email: "smoke-ics108-sinrol@example.com" }) ?? "",
    ),
  );

  // Colisión de mayúsculas sembrada a mano
  run("testHelpers:insertSmokeAuthUser", { email: "smoke-ics108-dup@example.com", role: "vendedor" });
  run("testHelpers:insertSmokeAuthUser", { email: "SMOKE-ICS108-DUP@example.com", role: "vendedor" });
  check("Correo ambiguo (dos filas) se rechaza", googleRejected("smoke-ics108-dup@example.com", "smoke-sub-dup"));

  // Nuevas invitaciones no pueden crear colisiones
  check(
    "Invitar el mismo correo con otras mayúsculas se rechaza",
    Boolean(runFails("users:createPendingUserRow", { email: INVITED.toUpperCase(), name: "x", role: "vendedor" })),
  );

  // Password sigue funcionando; open-access ya no existe
  const pw = run("auth:signIn", { provider: "password", params: { email: INVITED, password, flow: "signIn" } });
  check("Password sigue funcionando", Boolean(pw?.tokens?.token));
  check(
    "open-access se rechaza en el servidor",
    Boolean(runFails("auth:signIn", { provider: "open-access", params: { role: "administrador" } })),
  );

  // changeUserEmail mueve también la credencial de Password
  const moved = run("users:changeUserEmail", { from: INVITED, to: "smoke-ics108-nuevo@example.com" });
  check("changeUserEmail conserva el _id", moved.userId === invitedId && moved.passwordUpdated === true);
  const pwNew = run("auth:signIn", {
    provider: "password",
    params: { email: "smoke-ics108-nuevo@example.com", password, flow: "signIn" },
  });
  check("Password entra con el correo nuevo", Boolean(pwNew?.tokens?.token));
  check(
    "Password con el correo viejo ya no entra",
    Boolean(runFails("auth:signIn", { provider: "password", params: { email: INVITED, password, flow: "signIn" } })),
  );
  // ICS-131: cambiar el correo quita Google (esa cuenta de Google era del correo viejo)
  check("ICS-131: cambiar el correo quita la vinculación de Google", !byEmail("smoke-ics108-nuevo@example.com")?.accounts.some((a) => a.startsWith("google:")));
  check("…y el Google viejo ya no entra", googleRejected("smoke-ics108-nuevo@example.com", "smoke-sub-persona"));
  run("users:setGoogleAllowedByEmail", { email: "smoke-ics108-nuevo@example.com", allowed: true });
  check("Con el permiso de nuevo, Google se vuelve a vincular al mismo usuario", googleSignIn("smoke-ics108-nuevo@example.com", "smoke-sub-persona") === invitedId);

  // ICS-118: quitar el permiso rechaza también la vinculación ya existente, sin revincular
  run("users:setGoogleAllowedByEmail", { email: "smoke-ics108-nuevo@example.com", allowed: false });
  check("ICS-118: quitado el permiso, el mismo Google ya no entra", googleRejected("smoke-ics108-nuevo@example.com", "smoke-sub-persona"));
  check("…y la vinculación queda borrada", !byEmail("smoke-ics108-nuevo@example.com")?.accounts.some((a) => a.startsWith("google:")));

  const after = dump().totalUsers;
  check("No se creó ningún usuario fuera de los sembrados", after === baseline + 3, `${baseline} → ${after}`);
} finally {
  const { deleted } = run("testHelpers:deleteSmokeAuthUsers");
  console.log(`Limpieza: ${deleted} filas de prueba borradas.`);
}

console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
