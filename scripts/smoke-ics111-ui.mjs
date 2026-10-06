// Smoke test de ICS-111 (recuperar contraseña con código) — pantallas, en navegador.
// Recorre las 3 pantallas del login (correo → código → contraseña nueva) sobre
// el sitio estático (out/) servido como lo sirve Cloudflare Pages, contra el
// deployment de DESARROLLO.
//
// USO
//   npm run build                                  # genera out/ con la URL de dev de .env.local
//   npm install --no-save puppeteer-core@25        # no es dependencia del proyecto
//   CHROME_PATH="/ruta/a/Google Chrome" node scripts/smoke-ics111-ui.mjs
//   (sin CHROME_PATH usa "/Applications/Google Chrome 2.app/…", el Chrome de esta Mac)
//
// También usa `npx convex env set/remove PASSWORD_RESET_FAILPOINT` en dev para
// comprobar el mensaje ante una falla del servidor (se borra al final).
//
// DATOS
//   Cuenta delivered+ics111ui@resend.dev; se borra al final, incluso si falla.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer-core";

const DEV_URL = readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_CONVEX_URL=(\S+)/)?.[1] ?? "";
if (!DEV_URL || DEV_URL.includes("perfect-crocodile-599")) throw new Error("Solo contra el deployment de desarrollo.");
if (!existsSync("out/login.html")) throw new Error("Falta out/: corre `npm run build` primero.");

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome";
const PORT = 4399;
const BASE = `http://localhost:${PORT}`;
const EMAIL = "delivered+ics111ui@resend.dev";
const OLD_PASS = randomBytes(9).toString("base64url");
const NEW_PASS = randomBytes(9).toString("base64url");

let failures = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "✔" : "✘"} ${l}${d ? ` — ${d}` : ""}`); if (!ok) failures++; };
const run = (fn, args = {}) => { const o = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); return o ? JSON.parse(o) : null; };
const setFailpoint = (name) => execFileSync("npx", name ? ["convex", "env", "set", "PASSWORD_RESET_FAILPOINT", name] : ["convex", "env", "remove", "PASSWORD_RESET_FAILPOINT"], { stdio: "ignore" });
const hash = (e, c) => createHash("sha256").update(`${e}:${c}`).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitText = (p, t, ms = 30000) => p.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t);
const has = (p, t) => p.evaluate((x) => document.body.innerText.includes(x), t);
async function set(p, sel, val) { await p.waitForSelector(sel); await p.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, val); }
const submit = (p) => p.$eval("form", (f) => f.requestSubmit());
async function click(p, text) { await waitText(p, text); await p.$$eval("button", (els, t) => els.find((e) => e.innerText.trim() === t).click(), text); }

// Servidor estático como Cloudflare Pages: /ruta → ruta.html; 404.html si no existe.
const root = path.resolve("out");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const c of [p, `${p}.html`, path.join(p, "index.html")]) {
    const f = path.join(root, c);
    if (f.startsWith(root) && existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" }); return createReadStream(f).pipe(res); }
  }
  res.writeHead(404, { "content-type": "text/html" });
  createReadStream(path.join(root, "404.html")).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
  run("testHelpers:deleteSmokeAuthUsers");
  run("testHelpers:insertSmokeAuthUser", { email: EMAIL, role: "vendedor" });
  run("users:provisionPassword", { email: EMAIL, password: OLD_PASS });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await set(p, "#email", EMAIL);
  await click(p, "Olvidé mi contraseña");
  await waitText(p, "Recupera tu contraseña");
  check("Pantalla 1 con el correo del login precargado", (await p.$eval("#pc-email", (e) => e.value)) === EMAIL);
  await submit(p);
  await waitText(p, "Escribe tu código");
  check("Pantalla 2: aviso genérico (no confirma que la cuenta exista)", await has(p, `Si ${EMAIL} tiene acceso al CRM`));

  await set(p, "#pc-code", "123");
  await submit(p);
  await waitText(p, "El código tiene 8 dígitos.");
  check("Código incompleto no avanza", await has(p, "Escribe tu código"));
  await set(p, "#pc-code", "99999999");
  await submit(p);
  await waitText(p, "Crea tu contraseña nueva");
  check("'Continuar' solo avanza; no anuncia el código como válido", !(await has(p, "válido")) && !(await has(p, "verificado")));

  await set(p, "#pc-pass", "corta"); await set(p, "#pc-confirm", "corta"); await submit(p);
  await waitText(p, "entre 8 y 128");
  await set(p, "#pc-pass", NEW_PASS); await set(p, "#pc-confirm", `${NEW_PASS}x`); await submit(p);
  await waitText(p, "Las contraseñas no coinciden.");
  check("Contraseña corta y no coincidente se rechazan en pantalla", true);
  await set(p, "#pc-confirm", NEW_PASS); await submit(p);
  await waitText(p, "El código es incorrecto o ya venció");
  check("Código incorrecto: regresa a la pantalla 2 con aviso", await has(p, "Escribe tu código"));

  // Falla del servidor a media transacción: mensaje distinto, sigue en la pantalla 3, el código sigue sirviendo
  run("testHelpers:setSmokeResetCode", { email: EMAIL, codeHash: hash(EMAIL, "24681357"), expiresAt: Date.now() + 600000 });
  await set(p, "#pc-code", "24681357"); await submit(p);
  await waitText(p, "Crea tu contraseña nueva");
  setFailpoint("after_password_change");
  await sleep(2000);
  await set(p, "#pc-pass", NEW_PASS); await set(p, "#pc-confirm", NEW_PASS); await submit(p);
  await waitText(p, "No pudimos confirmar el resultado");
  check("Falla del servidor: no dice 'código incorrecto' y se queda en la pantalla 3", (await has(p, "Crea tu contraseña nueva")) && !(await has(p, "El código es incorrecto")));
  setFailpoint(null);
  await sleep(2000);
  await submit(p);
  await p.waitForFunction(() => location.pathname === "/tareas", { timeout: 30000 });
  check("Al reintentar con el mismo código → entra al CRM (/tareas)", true);

  const p2 = await (await browser.createBrowserContext()).newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await set(p2, "#email", EMAIL); await set(p2, "#pass", OLD_PASS); await submit(p2);
  await waitText(p2, "Correo o contraseña incorrectos.");
  check("En el login, la contraseña anterior ya no entra", true);
  await click(p2, "Olvidé mi contraseña");
  await click(p2, "Volver a iniciar sesión");
  check("'Volver a iniciar sesión' regresa al login", Boolean(await p2.$("#pass")));
  check("Sin errores de JavaScript", errors.length === 0, errors.join(" | "));
} catch (e) {
  failures++;
  console.log(`✘ Error en la prueba: ${e.message}`);
} finally {
  try { setFailpoint(null); } catch { /* ya no existía */ }
  if (browser) await browser.close();
  server.close();
  console.log("Limpieza:", JSON.stringify(run("testHelpers:deleteSmokeAuthUsers")));
}
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`);
process.exit(failures === 0 ? 0 : 1);
