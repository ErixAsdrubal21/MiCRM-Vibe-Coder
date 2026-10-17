// Smoke test de ICS-117 (desactivar y reactivar usuarios) — pantalla, en navegador.
// Sirve out/ aplicando out/_headers (como Cloudflare Pages, con la CSP) y,
// contra el deployment de DESARROLLO: una administradora desactiva a un
// vendedor desde Configuración → Equipo mientras el vendedor tiene el CRM
// abierto en otro navegador (lo saca al login), intenta entrar desactivado y
// después lo reactiva.
//
// USO
//   npm run build                                  # out/ con la URL de dev de .env.local
//   npm install --no-save puppeteer-core@25        # no es dependencia del proyecto
//   CHROME_PATH="/ruta/a/Google Chrome" node scripts/smoke-ics117-ui.mjs
//   (sin CHROME_PATH usa "/Applications/Google Chrome 2.app/…", el Chrome de esta Mac)
//
// DATOS
//   Cuentas delivered+ics117ui*@resend.dev; se borran al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer-core";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) throw new Error("Solo contra el deployment de desarrollo.");
if (!existsSync("out/_headers")) throw new Error("Falta out/: corre `npm run build` primero.");

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome";
const PORT = 4397;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "delivered+ics117ui-admin@resend.dev";
const VEND = "delivered+ics117ui@resend.dev";
const PASS = { [ADMIN]: randomBytes(12).toString("base64url"), [VEND]: randomBytes(12).toString("base64url") };
const NAME = "[SMOKE ICS-108]"; // nombre que pone testHelpers:insertSmokeAuthUser

let failures = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "✔" : "✘"} ${l}${d ? ` — ${d}` : ""}`); if (!ok) failures++; };
const run = (fn, args = {}) => { const o = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); return o ? JSON.parse(o) : null; };
const waitText = (p, t, ms = 30000) => p.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t);
const has = (p, t) => p.evaluate((x) => document.body.innerText.includes(x), t);
async function set(p, sel, val) { await p.waitForSelector(sel); await p.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, val); }
const submit = (p) => p.$eval("form", (f) => f.requestSubmit());
async function clickText(p, text) { await waitText(p, text); await p.$$eval("button", (els, t) => els.find((e) => e.innerText.trim() === t).click(), text); }
async function clickLabel(p, label) { const sel = `button[aria-label="${label}"]`; await p.waitForSelector(sel, { timeout: 30000 }); await p.click(sel); }
async function login(p, email) {
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await set(p, "#email", email);
  await set(p, "#pass", PASS[email]);
  await submit(p);
}

// _headers → cabeceras por ruta (solo rutas exactas y "/*"), como en smoke-ics115-csp.
const rules = [];
for (const block of readFileSync("out/_headers", "utf8").split(/\n(?=\/)/)) {
  const [first, ...rest] = block.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (first) rules.push({ pattern: first.trim(), headers: rest.map((l) => l.trim().split(/:\s(.*)/s).slice(0, 2)) });
}
const headersFor = (p) => rules.filter((r) => r.pattern === "/*" || r.pattern === p).flatMap((r) => r.headers);
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
  res.writeHead(404, { "content-type": "text/html" });
  createReadStream(path.join(root, "404.html")).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let browser;
const pages = {};
const problems = [];
try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: ADMIN, role: "administrador" });
  run("testHelpers:insertSmokeAuthUser", { email: VEND, role: "vendedor" });
  for (const email of [ADMIN, VEND]) run("users:provisionPassword", { email, password: PASS[email] });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

  const vend = await (await browser.createBrowserContext()).newPage();
  const admin = await (await browser.createBrowserContext()).newPage();
  Object.assign(pages, { vend, admin });
  for (const p of [vend, admin]) {
    p.on("pageerror", (e) => problems.push(`JS: ${e.message}`));
    p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`); });
  }

  await login(vend, VEND);
  await vend.waitForFunction(() => location.pathname === "/tareas", { timeout: 30000 });
  check("El vendedor tiene el CRM abierto", true);

  await login(admin, ADMIN);
  await admin.waitForFunction(() => location.pathname !== "/login", { timeout: 30000 });
  await admin.goto(`${BASE}/configuracion`, { waitUntil: "domcontentloaded" });
  await clickLabel(admin, `Desactivar a ${NAME}`);
  await waitText(admin, `¿Desactivar a ${NAME}?`);
  check("Pide confirmación explicando qué pasa", await has(admin, "Se cerrarán sus sesiones y no podrá entrar. Sus datos se conservan."));
  await clickText(admin, "Sí, desactivar");
  await waitText(admin, "Vendedor · Desactivada");
  check("La fila queda marcada como desactivada", true);
  // Las dos cuentas de prueba se llaman igual; el vendedor ya está desactivado, así que
  // un botón "Desactivar a [SMOKE ICS-108]" solo podría ser el de su propia fila.
  check("La administradora no tiene botón para desactivarse a sí misma",
    (await admin.$$eval(`button[aria-label="Desactivar a ${NAME}"]`, (els) => els.length)) === 0);

  await vend.waitForFunction(() => location.pathname === "/login", { timeout: 30000 });
  check("Al vendedor lo saca al login en cuanto se desactiva", true);

  await set(vend, "#email", VEND);
  await set(vend, "#pass", PASS[VEND]);
  await submit(vend);
  await waitText(vend, "Correo o contraseña incorrectos.");
  check("Desactivado no puede entrar (mensaje genérico del login)", await vend.evaluate(() => location.pathname === "/login"));

  await clickLabel(admin, `Reactivar a ${NAME}`);
  await clickText(admin, "Sí, reactivar");
  await admin.waitForFunction(() => !document.body.innerText.includes("Desactivada"), { timeout: 30000 });
  check("Reactivar quita la marca de desactivada", true);

  await submit(vend);
  await vend.waitForFunction(() => location.pathname === "/tareas", { timeout: 30000 });
  check("Reactivado, entra con su contraseña de siempre", true);
  check("Sin errores de JavaScript ni violaciones de CSP", problems.length === 0, problems.slice(0, 3).join(" | "));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
  if (problems.length) console.log("  Problemas:", problems.slice(0, 3).join(" | "));
  for (const [name, p] of Object.entries(pages)) console.log(`  ${name} estaba en: ${p.url()}`);
} finally {
  if (browser) await browser.close();
  server.close();
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
