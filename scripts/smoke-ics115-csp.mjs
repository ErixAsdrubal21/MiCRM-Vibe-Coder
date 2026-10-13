// Smoke test de ICS-115 (cabeceras de seguridad y CSP) — en navegador.
// Sirve out/ aplicando out/_headers como Cloudflare Pages y recorre el CRM con
// la CSP APLICADA (no Report-Only), contra el deployment de DESARROLLO:
// login con contraseña, todas las rutas, recuperación (pantalla 1 → 2),
// el inicio con Google (hasta llegar a accounts.google.com) y el bloqueo de
// la app dentro de un iframe de otro origen. Cualquier violación de CSP falla.
//
// USO
//   CSP_MODE=enforce npm run build                 # out/ con la CSP aplicada y la URL de dev
//   npm install --no-save puppeteer-core@25        # no es dependencia del proyecto
//   CHROME_PATH="/ruta/a/Google Chrome" node scripts/smoke-ics115-csp.mjs
//   (sin CHROME_PATH usa "/Applications/Google Chrome 2.app/…", el Chrome de esta Mac)
//
// DATOS
//   Cuenta delivered+ics115@resend.dev (administrador, para ver todas las
//   pantallas); se borra al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer-core";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) throw new Error("Solo contra el deployment de desarrollo.");
if (!existsSync("out/_headers")) throw new Error("Falta out/_headers: corre `CSP_MODE=enforce npm run build` primero.");
const HEADERS_FILE = readFileSync("out/_headers", "utf8");
if (!/^\s+Content-Security-Policy:/m.test(HEADERS_FILE)) throw new Error("out/ no tiene la CSP aplicada: corre `CSP_MODE=enforce npm run build`.");

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome";
const PORT = 4399;
const EVIL_PORT = 4398;
const BASE = `http://localhost:${PORT}`;
const EMAIL = "delivered+ics115@resend.dev";
const PASS = randomBytes(12).toString("base64url");

let failures = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "✔" : "✘"} ${l}${d ? ` — ${d}` : ""}`); if (!ok) failures++; };
const run = (fn, args = {}) => { const o = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); return o ? JSON.parse(o) : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitText = (p, t, ms = 30000) => p.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t);
async function set(p, sel, val) { await p.waitForSelector(sel); await p.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, val); }
const submit = (p) => p.$eval("form", (f) => f.requestSubmit());
async function click(p, text) { await waitText(p, text); await p.$$eval("button", (els, t) => els.find((e) => e.innerText.trim() === t).click(), text); }

// _headers → [{ pattern, headers }]. Solo se usan rutas exactas y "/*".
const rules = [];
for (const block of HEADERS_FILE.split(/\n(?=\/)/)) {
  const [first, ...rest] = block.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (!first) continue;
  rules.push({ pattern: first.trim(), headers: rest.map((l) => l.trim().split(/:\s(.*)/s).slice(0, 2)) });
}
const headersFor = (p) => rules.filter((r) => r.pattern === "/*" || r.pattern === p).flatMap((r) => r.headers);
const routes = rules.map((r) => r.pattern).filter((p) => p !== "/*");

// Servidor estático como Cloudflare Pages: /ruta → ruta.html (+ cabeceras de _headers); 404.html si no existe.
const root = path.resolve("out");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const c of [p, `${p}.html`, path.join(p, "index.html")]) {
    const f = path.join(root, c);
    if (f.startsWith(root) && existsSync(f) && statSync(f).isFile()) {
      res.writeHead(200, Object.fromEntries([["content-type", types[path.extname(f)] ?? "application/octet-stream"], ...headersFor(p)]));
      return createReadStream(f).pipe(res);
    }
  }
  res.writeHead(404, Object.fromEntries([["content-type", "text/html"], ...headersFor(p)]));
  createReadStream(path.join(root, "404.html")).pipe(res);
});
// Otro origen que intenta meter el CRM en un iframe (clickjacking).
const evil = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><iframe id="f" src="${BASE}/login" width="400" height="400"></iframe>`);
});
await new Promise((r) => server.listen(PORT, r));
await new Promise((r) => evil.listen(EVIL_PORT, r));

let browser;
const violations = [];
const errors = [];
async function watch(p) {
  await p.exposeFunction("__cspViolation", (v) => violations.push(v));
  await p.evaluateOnNewDocument(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__cspViolation(`${location.pathname}: ${e.effectiveDirective} bloqueó ${e.blockedURI || "inline"} (${e.sample || ""})`));
  });
  p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(`consola: ${m.text()}`); });
  p.on("pageerror", (e) => errors.push(e.message));
}

try {
  check("La regla /* trae las cabeceras básicas", ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security", "Cross-Origin-Opener-Policy"].every((h) => headersFor("/x").some(([k]) => k === h)));
  check("La CSP solo va en reglas por ruta, nunca en /*", !headersFor("/no-existe").some(([k]) => k.startsWith("Content-Security-Policy")));
  check("Cada ruta tiene su CSP", routes.every((r) => headersFor(r).some(([k]) => k === "Content-Security-Policy")), `${routes.length} rutas`);
  check("connect-src apunta solo al Convex de desarrollo", HEADERS_FILE.includes(new URL(DEV_URL).host) && !HEADERS_FILE.includes("perfect-crocodile-599"));
  check("Sin 'unsafe-inline' en script-src", !/script-src[^;]*'unsafe-inline'/.test(HEADERS_FILE));

  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: EMAIL, role: "administrador" });
  run("users:provisionPassword", { email: EMAIL, password: PASS });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

  // 1. Login con contraseña y recorrido de todas las rutas.
  const p = await browser.newPage();
  await watch(p);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await set(p, "#email", EMAIL);
  await set(p, "#pass", PASS);
  await submit(p);
  await p.waitForFunction(() => location.pathname !== "/login", { timeout: 30000 });
  check("Login con contraseña funciona con la CSP aplicada", true, await p.evaluate(() => location.pathname));
  for (const route of routes.filter((r) => r !== "/login")) {
    await p.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
    await sleep(1500);
  }
  check("Recorrido de todas las rutas con sesión", true, `${routes.length - 1} rutas`);
  check("La app recibe datos de Convex (WebSocket permitido)", await p.evaluate(() => document.body.innerText.trim().length > 0 && !document.body.innerText.includes("No autenticado")));

  // 2. Recuperación de contraseña: pantalla 1 → 2 (llama a passwordReset.request).
  const p2 = await (await browser.createBrowserContext()).newPage();
  await watch(p2);
  await p2.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await set(p2, "#email", EMAIL);
  await click(p2, "Olvidé mi contraseña");
  await waitText(p2, "Recupera tu contraseña");
  await submit(p2);
  await waitText(p2, "Escribe tu código");
  check("Recuperación: pide el código con la CSP aplicada", true);

  // 3. Google: el botón debe sacar al navegador hacia accounts.google.com.
  const p3 = await (await browser.createBrowserContext()).newPage();
  await watch(p3);
  await p3.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  const toGoogle = p3.waitForRequest((r) => r.url().startsWith("https://accounts.google.com/"), { timeout: 30000 });
  await click(p3, "Continuar con Google");
  check("Google: la redirección llega a accounts.google.com", Boolean(await toGoogle));

  // 4. Clickjacking: otro origen no puede mostrar el CRM en un iframe.
  const p4 = await (await browser.createBrowserContext()).newPage();
  await p4.goto(`http://localhost:${EVIL_PORT}/`, { waitUntil: "networkidle0" });
  await sleep(1000);
  const framed = p4.frames().find((f) => f !== p4.mainFrame());
  const framedLoaded = framed ? await framed.evaluate(() => Boolean(document.querySelector("#email"))).catch(() => false) : false;
  check("Un iframe de otro origen no puede cargar el login", !framedLoaded, framed?.url() ?? "sin frame");

  check("Sin violaciones de CSP", violations.length === 0, [...new Set(violations)].slice(0, 5).join(" | "));
  check("Sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
  if (violations.length) console.log("  Violaciones:", [...new Set(violations)].slice(0, 5).join(" | "));
} finally {
  if (browser) await browser.close();
  server.close();
  evil.close();
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
