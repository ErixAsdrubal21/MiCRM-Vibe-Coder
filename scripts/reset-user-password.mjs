// "Break glass" — restablece la contraseña de una cuenta que YA existe
// (Carlos o Marta) sin necesitar una sesión de administrador activa. Para
// cuando el único administrador pierde su propia contraseña y nadie puede
// usar el flujo normal (Configuración → Equipo → restablecer) para
// desbloquearlo.
//
// Se corre localmente: `node scripts/reset-user-password.mjs`. La
// contraseña nueva se pide con un prompt oculto (sin eco en pantalla) y
// nunca se convierte en argumento de ningún proceso — no queda en el
// historial del shell ni es visible por `ps`.
//
// No pasar contraseñas en comandos de shell ni pegarlas en un chat/IA — el
// único lugar donde la contraseña real debe existir es este prompt.
//
// Contra producción: `CONVEX_DEPLOY_KEY=<deploy key de prod> node scripts/reset-user-password.mjs`
// (mismo mecanismo que scripts/provision-user.mjs).

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
  const email = await rl.question("Email cuya contraseña quieres restablecer (carlos@... o marta@...): ");
  rl.close();
  const password = await readHidden("Contraseña nueva (no se muestra en pantalla, mínimo 8 caracteres): ");

  if (!email.trim() || password.length < 8) {
    console.error("Email obligatorio; la contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  const client = new ConvexHttpClient(url ?? "http://127.0.0.1:3210");

  if (deployKey) {
    client.setAdminAuth(deployKey);
  } else {
    const configPath = new URL("../.convex/local/default/config.json", import.meta.url);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    client.setAdminAuth(config.adminKey);
  }

  await client.action(anyApi.users.resetPasswordByEmail, { email: email.trim(), newPassword: password });
  console.log(`Contraseña restablecida para ${email.trim()}. Sus sesiones activas quedaron invalidadas.`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
