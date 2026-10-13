// ICS-115 — genera `out/_headers` (cabeceras de Cloudflare Pages) después de
// `next build`. Corre como parte de `npm run build`, así que cada build trae
// su propia política:
//
// - `connect-src` apunta al Convex con el que se compiló (`NEXT_PUBLIC_CONVEX_URL`):
//   Preview queda con el de desarrollo y producción con el de producción, sin
//   comodines.
// - `script-src` no usa `'unsafe-inline'`: lleva el hash SHA-256 de cada script
//   inline que Next escribe en cada página (`self.__next_f.push(...)`), así que
//   cada ruta tiene su propia regla. El export es estático: no hay servidor
//   que pueda poner un nonce por petición.
//
// Formato y límites de `_headers`: https://developers.cloudflare.com/pages/configuration/headers/
// (máx. 100 reglas, 2 000 caracteres por línea). Si varias reglas coinciden,
// Cloudflare junta sus cabeceras; por eso la CSP va solo en las reglas por
// ruta y nunca en `/*` (dos CSP se aplican las dos y se bloquearían entre sí).
//
// CSP_MODE: "report-only" (etapa A de ICS-115: solo avisa en la consola) o
// "enforce" (etapa B: bloquea).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CSP_MODE = process.env.CSP_MODE ?? "report-only";
const OUT = path.resolve("out");
const MAX_RULES = 100;
const MAX_LINE = 2000;

/** Páginas que Cloudflare sirve en una ruta que no se conoce de antemano (cualquier URL inexistente). */
const SKIP = new Set(["404.html", "_not-found.html"]);

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? readEnvLocal("NEXT_PUBLIC_CONVEX_URL");
if (!convexUrl) throw new Error("generate-headers: falta NEXT_PUBLIC_CONVEX_URL.");
const convexHost = new URL(convexUrl).host;

function readEnvLocal(name) {
  try {
    return readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(\\S+)`, "m"))?.[1];
  } catch {
    return undefined;
  }
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "_next" ? [] : htmlFiles(full);
    return entry.name.endsWith(".html") ? [full] : [];
  });
}

/** Hash de cada `<script>` sin `src`, sobre el texto exacto entre las etiquetas (como lo calcula el navegador). */
function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(attrs)) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

/** `out/prospectos/ficha.html` → `/prospectos/ficha`; `out/index.html` → `/`. */
function routeOf(file) {
  const rel = path.relative(OUT, file).split(path.sep).join("/").replace(/\.html$/, "");
  if (rel === "index") return "/";
  return `/${rel.replace(/\/index$/, "")}`;
}

function csp(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
    // React escribe atributos `style="..."` en el HTML prerenderizado; sin
    // 'unsafe-inline' aquí se perderían estilos. El riesgo de estilos inline es
    // mucho menor que el de scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://${convexHost} wss://${convexHost}`,
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const cspHeader = CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

const lines = [
  "# Generado por scripts/generate-headers.mjs (ICS-115). No editar a mano.",
  "/*",
  "  X-Frame-Options: DENY",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  // Google se abre con redirección de página completa, no con ventana emergente.
  "  Cross-Origin-Opener-Policy: same-origin",
  // HSTS empieza en 1 día; el plan para subirlo está en ICS-115.
  "  Strict-Transport-Security: max-age=86400",
];

const files = htmlFiles(OUT).filter((f) => !SKIP.has(path.relative(OUT, f)));
if (files.length + 1 > MAX_RULES) throw new Error(`generate-headers: ${files.length + 1} reglas, el máximo es ${MAX_RULES}.`);

for (const file of files.sort()) {
  const header = `  ${cspHeader}: ${csp(inlineScriptHashes(readFileSync(file, "utf8")))}`;
  if (header.length > MAX_LINE) throw new Error(`generate-headers: la CSP de ${routeOf(file)} mide ${header.length} caracteres (máx. ${MAX_LINE}).`);
  lines.push("", routeOf(file), header);
}

writeFileSync(path.join(OUT, "_headers"), `${lines.join("\n")}\n`);
console.log(`generate-headers: out/_headers con ${files.length} rutas (${cspHeader}, connect-src ${convexHost}).`);
