// Llama una función de Convex con `npx convex run` (el deployment de .env.local),
// y lee/cambia variables de entorno de dev (`convexEnvGet` / `convexEnvSet`).
//
// Si falla, el error NUNCA incluye los argumentos: pueden llevar contraseñas
// de prueba (p. ej. users:provisionPassword) y el mensaje por defecto de
// execFileSync ("Command failed: npx convex run <fn> <args>") las imprimiría
// en la consola o en un registro de CI. Solo lleva el nombre de la función y
// el stderr de Convex, recortado. (Hallazgo de CodeRabbit en el PR #21, CWE-532.)
//
// Y se NIEGA a correr si no es contra el deployment de desarrollo: `npx
// convex run` usa CONVEX_DEPLOY_KEY si está en el entorno (podría ser la de
// producción, también si está en .env.local o .env) o, si no, CONVEX_DEPLOYMENT
// de .env.local. Así ninguna prueba
// puede tocar producción aunque se le olvide su propia guardia (también PR #21).

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROD_DEPLOYMENT = "perfect-crocodile-599";

function readOptional(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// Variables con las que el CLI de Convex (1.42.x, cli/lib/utils/utils.js) elige otro deployment
// en vez del de .env.local. Cualquiera de ellas podría apuntar a producción (PR #23).
const DEPLOYMENT_CREDENTIAL_VARS = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"];

export function assertDevelopmentTarget() {
  const inProcess = DEPLOYMENT_CREDENTIAL_VARS.filter((name) => process.env[name]);
  if (inProcess.length > 0) {
    throw new Error(`convexRun: hay ${inProcess.join(", ")} en el entorno y podría apuntar a producción. Quítala para correr las pruebas.`);
  }
  let envLocal = "";
  try {
    envLocal = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error("convexRun: falta .env.local (corre las pruebas desde la raíz del proyecto, con `npx convex dev` configurado).");
  }
  // El CLI de Convex también carga .env.local y .env (con dotenv, que acepta `CLAVE=valor` y
  // `CLAVE: valor`, con o sin `export`): una credencial ahí se usaría igual. Para no depender de
  // los detalles de dotenv, se bloquea cualquier línea que asigne una de esas variables con `=` o
  // `:`, aunque el valor esté vacío —más estricto que lo que dotenv cargaría— (PR #23).
  const credentialLine = new RegExp(`^[ \\t]*(?:export[ \\t]+)?(${DEPLOYMENT_CREDENTIAL_VARS.join("|")})[ \\t]*[=:]`, "m");
  for (const [file, content] of [[".env.local", envLocal], [".env", readOptional(".env")]]) {
    const found = content.match(credentialLine);
    if (found) {
      throw new Error(`convexRun: hay ${found[1]} en ${file} y podría apuntar a producción. Quítala para correr las pruebas.`);
    }
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

/**
 * Lee una variable de entorno del deployment de DESARROLLO. Devuelve null solo
 * si Convex responde que no existe; cualquier otro fallo lanza (así nadie
 * "restaura" quitando una variable que sí existía). (PR #23.)
 */
export function convexEnvGet(name) {
  assertDevelopmentTarget();
  const r = spawnSync("npx", ["convex", "env", "get", name], { encoding: "utf8" });
  const stdout = String(r.stdout ?? "").trim();
  if (r.status === 0 && stdout !== "") return stdout;
  if (r.status === 0 && /not found/i.test(String(r.stderr ?? ""))) return null;
  throw new Error(`convexEnvGet: no se pudo leer ${name}.`);
}

/**
 * Cambia (o, con `null`, quita) una variable de entorno del deployment de
 * DESARROLLO. Valida el destino antes de tocar nada y el error nunca incluye el
 * valor (puede ser una llave secreta). (PR #23.)
 */
export function convexEnvSet(name, value) {
  assertDevelopmentTarget();
  try {
    execFileSync("npx", value === null ? ["convex", "env", "remove", name] : ["convex", "env", "set", name, value], { stdio: "ignore" });
  } catch {
    throw new Error(`convexEnvSet: no se pudo ${value === null ? "quitar" : "cambiar"} ${name}.`);
  }
}
