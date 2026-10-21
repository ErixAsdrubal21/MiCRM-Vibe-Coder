// Smoke test de ICS-133 (los mensajes de error para el usuario llegan a la
// pantalla también en producción) — backend + helper de pantallas.
//
// En producción Convex oculta el texto de cualquier `Error` del servidor; solo
// entrega el contenido de un `ConvexError`. Aquí se comprueba, contra el
// deployment de DESARROLLO, que los mensajes de validación y permisos llegan
// como `ConvexError` (también desde una mutation llamada dentro de una
// action) y que `errorMessage` (src/lib/errors.js, el que usan las pantallas)
// muestra ese texto, y un mensaje genérico para cualquier otro error.
//
// USO (se niega a correr contra producción):
//   node scripts/smoke-ics133.mjs
//
// DATOS
//   Cuentas delivered+ics133*@resend.dev; se borran al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { ConvexError } from "convex/values";
import { errorMessage } from "../src/lib/errors.js";
import { convexRun } from "./convex-run.mjs";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) {
  throw new Error("Este smoke test solo corre contra el deployment de desarrollo.");
}

const ADMIN = "delivered+ics133-admin@resend.dev";
const VEND = "delivered+ics133@resend.dev";
const pass = { [ADMIN]: randomBytes(12).toString("base64url"), [VEND]: randomBytes(12).toString("base64url") };
const FALLBACK = "No se pudo completar la acción.";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const run = convexRun; // nunca imprime los argumentos si falla (scripts/convex-run.mjs)
const anon = () => new ConvexHttpClient(DEV_URL);
async function login(email) {
  const res = await anon().action(api.auth.signIn, { provider: "password", params: { email, password: pass[email], flow: "signIn" } });
  const c = new ConvexHttpClient(DEV_URL);
  c.setAuth(res.tokens.token);
  return c;
}
const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
/** Lo que vería la pantalla, y que el error sea un ConvexError con ese texto exacto. */
function shows(err, expected) {
  return err instanceof ConvexError && err.data === expected && errorMessage(err, FALLBACK) === expected;
}

try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  for (const email of [ADMIN, VEND]) run("users:provisionPassword", { email, password: pass[email] });
  const admin = await login(ADMIN);
  const vend = await login(VEND);
  const adminId = run("testHelpers:dumpSmokeAuth").smoke.find((u) => u.email === ADMIN)._id;

  // El caso que lo destapó: invitar un correo que ya existe (mutation dentro de una action)
  const e1 = await caught(admin.action(api.users.inviteUser, { email: VEND, name: "Duplicado", role: "vendedor" }));
  check("Invitar un correo existente muestra \"Ya existe una cuenta con ese correo.\"", shows(e1, "Ya existe una cuenta con ese correo."), errorMessage(e1, FALLBACK));

  // Validación de una mutation
  const e2 = await caught(admin.mutation(api.users.deactivateUser, { userId: adminId }));
  check("Validación de una mutation llega con su texto", shows(e2, "No puedes desactivar tu propia cuenta."), errorMessage(e2, FALLBACK));

  // Permisos (convex/permissions.js)
  const e3 = await caught(vend.mutation(api.users.setGoogleAllowed, { userId: adminId, allowed: true }));
  check("Un permiso negado llega con su texto", shows(e3, "Solo un administrador puede ver esta información."), errorMessage(e3, FALLBACK));

  // Validación dentro de una action
  const e4 = await caught(vend.action(api.users.changeOwnPassword, { currentPassword: "incorrecta", newPassword: "otra-contraseña-larga" }));
  check("Una action que valida llega con su texto", shows(e4, "La contraseña actual no es correcta."), errorMessage(e4, FALLBACK));

  // Cualquier otro error: mensaje genérico, nunca el texto crudo
  const e5 = await caught(anon().action(api.auth.signIn, { provider: "password", params: { email: VEND, flow: "reset" } }));
  check("Un error que no es para el usuario muestra el mensaje genérico", e5 && !(e5 instanceof ConvexError) && errorMessage(e5, FALLBACK) === FALLBACK);
  check("errorMessage nunca deja pasar \"Server Error\" ni Request ID",
    [e1, e2, e3, e4, e5].every((e) => !/Server Error|Request ID/.test(errorMessage(e, FALLBACK))));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
