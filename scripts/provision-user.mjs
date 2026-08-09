// Aprovisiona la credencial de Password para un usuario que YA existe en la
// tabla `users` (Carlos o Marta) — nunca crea un usuario nuevo (ver
// convex/auth.js:createOrUpdateUser, que rechaza cualquier otro correo).
//
// Se corre localmente, sin argumentos: `node scripts/provision-user.mjs`.
// La contraseña se pide con un prompt oculto (sin eco en pantalla) y nunca
// se convierte en argumento de ningún proceso — no queda en el historial
// del shell ni es visible por `ps` mientras corre, a diferencia de pasarla
// inline a `npx convex run`.
//
// No pasar contraseñas en comandos de shell ni pegarlas en un chat/IA — el
// único lugar donde la contraseña real debe existir es este prompt.
//
// Llama la función por HTTP directo con ConvexHttpClient + setAdminAuth
// (mismo mecanismo que usa la propia CLI de Convex internamente), sin pasar
// por `npx convex run` para este paso.
//
// Nota para producción (después de `npx convex deploy`, ya no el backend
// local anónimo): cambiar la lectura del adminKey por
// `process.env.CONVEX_DEPLOY_KEY`, que es como Convex Cloud expone esta
// misma credencial fuera del desarrollo local.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const KEY_ENTER = 13;
const KEY_NEWLINE = 10;
const KEY_CTRL_C = 3;
const KEY_BACKSPACE = 127;
const KEY_DELETE = 8;

function readHidden(promptText) {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    let input = "";

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    }

    function onData(chunk) {
      for (const ch of chunk.toString("utf8")) {
        const code = ch.charCodeAt(0);
        if (code === KEY_ENTER || code === KEY_NEWLINE) {
          cleanup();
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (code === KEY_CTRL_C) {
          cleanup();
          reject(new Error("Cancelado."));
          return;
        }
        if (code === KEY_BACKSPACE || code === KEY_DELETE) {
          input = input.slice(0, -1);
        } else {
          input += ch;
        }
      }
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = await rl.question("Email a aprovisionar (carlos@... o marta@...): ");
  rl.close();
  const password = await readHidden("Contraseña (no se muestra en pantalla): ");

  if (!email.trim() || !password) {
    console.error("Email y contraseña son obligatorios.");
    process.exit(1);
  }

  const configPath = new URL("../.convex/local/default/config.json", import.meta.url);
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
  client.setAdminAuth(config.adminKey);

  await client.action(anyApi.users.provisionPassword, { email: email.trim(), password });
  console.log(`Cuenta aprovisionada para ${email.trim()}.`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
