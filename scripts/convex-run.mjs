// Llama una función de Convex con `npx convex run` (el deployment de .env.local).
//
// Si falla, el error NUNCA incluye los argumentos: pueden llevar contraseñas
// de prueba (p. ej. users:provisionPassword) y el mensaje por defecto de
// execFileSync ("Command failed: npx convex run <fn> <args>") las imprimiría
// en la consola o en un registro de CI. Solo lleva el nombre de la función y
// el stderr de Convex, recortado. (Hallazgo de CodeRabbit en el PR #21, CWE-532.)
//
// Y se NIEGA a correr si no es contra el deployment de desarrollo: `npx
// convex run` usa CONVEX_DEPLOY_KEY si está en el entorno (podría ser la de
// producción) o, si no, CONVEX_DEPLOYMENT de .env.local. Así ninguna prueba
// puede tocar producción aunque se le olvide su propia guardia (también PR #21).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROD_DEPLOYMENT = "perfect-crocodile-599";

function assertDevelopmentTarget() {
  if (process.env.CONVEX_DEPLOY_KEY) {
    throw new Error("convexRun: hay CONVEX_DEPLOY_KEY en el entorno y podría apuntar a producción. Quítala para correr las pruebas.");
  }
  let envLocal = "";
  try {
    envLocal = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error("convexRun: falta .env.local (corre las pruebas desde la raíz del proyecto, con `npx convex dev` configurado).");
  }
  const deployment = process.env.CONVEX_DEPLOYMENT ?? envLocal.match(/^CONVEX_DEPLOYMENT=(\S+)/m)?.[1] ?? "";
  const url = envLocal.match(/^NEXT_PUBLIC_CONVEX_URL=(\S+)/m)?.[1] ?? "";
  if (!deployment.startsWith("dev:") || deployment.includes(PROD_DEPLOYMENT) || url.includes(PROD_DEPLOYMENT)) {
    throw new Error("convexRun: el deployment configurado no es el de desarrollo. Las pruebas nunca corren contra producción.");
  }
}

export function convexRun(fn, args = {}) {
  assertDevelopmentTarget();
  let out;
  try {
    out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    const stderr = String(e.stderr ?? "").trim();
    const err = new Error(`Falló ${fn}: ${stderr.slice(0, 500)}`);
    err.stderr = stderr;
    throw err;
  }
  return out ? JSON.parse(out) : null;
}
