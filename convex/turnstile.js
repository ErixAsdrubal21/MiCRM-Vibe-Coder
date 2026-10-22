/**
 * ICS-123 — validación de Cloudflare Turnstile del lado del servidor
 * (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
 * Solo desde actions (usa `fetch`).
 *
 * Entorno de Convex:
 * - TURNSTILE_SECRET_KEY: llave secreta del widget (prod: la real; dev: la de
 *   prueba de Cloudflare que siempre aprueba, 1x000…AA).
 * - TURNSTILE_ALLOWED_HOSTNAMES: dominios desde donde se acepta el token,
 *   separados por comas (prod: crm.icsaab.com; dev: example.com, que es lo
 *   que devuelven las llaves de prueba).
 * - TURNSTILE_ALLOW_TEST_KEYS=true: solo en dev. Sin ella, un resultado de
 *   llave de prueba se rechaza, así que en producción nunca se cuela una llave
 *   de prueba aunque alguien la configure por error.
 *
 * Falla cerrada: sin secreto, sin token, token vencido o ya usado, otro
 * dominio u otra acción → rechazado.
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token, expectedAction) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return { ok: false, reason: "missing-token" };

  let data;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    data = await response.json();
  } catch {
    return { ok: false, reason: "siteverify-unreachable" };
  }
  if (!data?.success) return { ok: false, reason: (data?.["error-codes"] ?? []).join(",") || "rejected" };

  const testing = Boolean(data.metadata?.result_with_testing_key);
  if (testing && process.env.TURNSTILE_ALLOW_TEST_KEYS !== "true") return { ok: false, reason: "test-key-not-allowed" };

  const allowed = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(data.hostname ?? "").toLowerCase())) return { ok: false, reason: "hostname-mismatch" };

  // Las llaves de prueba no devuelven `action`; las reales sí, y debe coincidir.
  if (!testing && data.action !== expectedAction) return { ok: false, reason: "action-mismatch" };
  return { ok: true };
}
