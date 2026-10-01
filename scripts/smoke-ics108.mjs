// Smoke test de ICS-108 (login con Google solo para cuentas aprovisionadas).
// Sin navegador ni Google: recorre la misma ruta interna que el callback
// OAuth de Convex Auth (`auth:store` verifier → verifierSignature →
// userOAuth → verifyCodeAndSignIn), así que ejercita `createOrUpdateUser`
// (convex/auth.js) exactamente como lo haría un regreso real de Google.
// Lo único que NO cubre es el intercambio HTTP con Google; el filtro
// `email_verified` se prueba aparte llamando `googleProfileOrReject`.
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

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function run(fn, args = {}) {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return out ? JSON.parse(out) : null;
}

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
    googleProfileOrReject({ sub: "x", email: " Ana@B.com ", email_verified: true }).email === "ana@b.com",
  );

  // M1: invitado con mayúsculas (flujo real de inviteUser) entra con Google en minúsculas
  const invitedId = run("users:createPendingUserRow", { email: INVITED, name: "[SMOKE ICS-108]", role: "vendedor" });
  run("users:provisionPassword", { email: INVITED, password });
  const googleUserId = googleSignIn(INVITED.toLowerCase(), "smoke-sub-persona");
  check("Google en minúsculas vincula al invitado con mayúsculas", googleUserId === invitedId, `${googleUserId} vs ${invitedId}`);
  const persona = byEmail(INVITED);
  check("Conserva _id y rol", persona?._id === invitedId && persona?.role === "vendedor");
  check(
    "Queda con cuentas password + google y una sesión",
    persona?.accounts.includes(`password:${INVITED}`) && persona?.accounts.includes("google:smoke-sub-persona") && persona?.sessions >= 1,
    JSON.stringify(persona),
  );
  check("Segundo login con Google reutiliza la vinculación", googleSignIn(INVITED.toLowerCase(), "smoke-sub-persona") === invitedId);

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
  check(
    "El vínculo de Google existente sigue apuntando al mismo usuario tras el cambio",
    googleSignIn("smoke-ics108-nuevo@example.com", "smoke-sub-persona") === invitedId,
  );

  const after = dump().totalUsers;
  check("No se creó ningún usuario fuera de los sembrados", after === baseline + 3, `${baseline} → ${after}`);
} finally {
  const { deleted } = run("testHelpers:deleteSmokeAuthUsers");
  console.log(`Limpieza: ${deleted} filas de prueba borradas.`);
}

console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
