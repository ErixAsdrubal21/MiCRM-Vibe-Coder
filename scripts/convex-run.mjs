// Llama una función de Convex con `npx convex run` (el deployment de .env.local).
//
// Si falla, el error NUNCA incluye los argumentos: pueden llevar contraseñas
// de prueba (p. ej. users:provisionPassword) y el mensaje por defecto de
// execFileSync ("Command failed: npx convex run <fn> <args>") las imprimiría
// en la consola o en un registro de CI. Solo lleva el nombre de la función y
// el stderr de Convex, recortado. (Hallazgo de CodeRabbit en el PR #21, CWE-532.)

import { execFileSync } from "node:child_process";

export function convexRun(fn, args = {}) {
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
