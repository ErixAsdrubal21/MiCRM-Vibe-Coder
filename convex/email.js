/**
 * ICS-110 — envío de correos desde Convex con la API de Resend. Los correos
 * siempre salen del backend: `RESEND_API_KEY` vive solo en el entorno de
 * Convex (llave restringida a enviar) y nunca llega al navegador.
 *
 * Remitente fijo en el dominio verificado en Resend (DKIM/SPF en el DNS de
 * Wix). Solo se llama desde actions (`fetch`).
 */

const FROM = "CRM ICSAAB <no-reply@crm.icsaab.com>";
const ACCENT = "#E2680C";

/**
 * Dominios ficticios o de prueba que no deben recibir correo: `minegocio.com`
 * es un dominio real de un tercero que se usó en cuentas de ejemplo, y
 * `example.com` lo usan los smoke tests. Enviarles generaría rebotes (y
 * dañaría la reputación del dominio) o le llegaría a un desconocido.
 */
const BLOCKED_DOMAINS = ["minegocio.com", "example.com"];

export function canReceiveEmail(address) {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  return domain !== "" && !BLOCKED_DOMAINS.includes(domain);
}

/** Envía un correo con Resend. Lanza un error entendible si Resend lo rechaza. */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Falta RESEND_API_KEY en el entorno de Convex.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`No se pudo enviar el correo (${response.status}${detail.message ? `: ${detail.message}` : ""}).`);
  }
  return response.json();
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Plantilla base: un bloque de contenido con la marca del CRM, legible en cualquier cliente de correo. */
function layout({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <tr><td>
      <p style="margin:0 0 20px;font-size:15px;font-weight:bold;color:${ACCENT};">CRM ICSAAB</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:28px 0 0;font-size:12px;color:#777;">Este correo lo envió el CRM de ICSAAB. Si no lo esperabas, puedes ignorarlo.</p>
    </td></tr>
  </table>
</body></html>`;
}

/** Correo con el código de un solo uso para restablecer la contraseña (ICS-111). */
export function resetCodeEmail({ code, minutes }) {
  const subject = "Tu código para restablecer tu contraseña — CRM ICSAAB";
  const html = layout({
    title: "Tu código para restablecer tu contraseña",
    bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Escríbelo en la pantalla del CRM para crear tu contraseña nueva:</p>
      <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px;color:${ACCENT};">${escapeHtml(code)}</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#555;">Vence en ${minutes} minutos y solo se puede usar una vez. Si pides otro código, este deja de servir.</p>`,
  });
  const text = `Tu código para restablecer tu contraseña de CRM ICSAAB: ${code}\nVence en ${minutes} minutos y solo se puede usar una vez.\nSi no lo pediste, ignora este correo.`;
  return { subject, html, text };
}

/** Aviso posterior a un cambio de contraseña confirmado (ICS-111). */
export function passwordChangedEmail() {
  const subject = "Tu contraseña de CRM ICSAAB se cambió";
  const html = layout({
    title: "Tu contraseña se cambió",
    bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">La contraseña de tu cuenta del CRM se acaba de cambiar con un código enviado a este correo, y se cerraron las sesiones que estaban abiertas.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#555;">Si no fuiste tú, avisa de inmediato a la administradora del CRM.</p>`,
  });
  const text = "La contraseña de tu cuenta de CRM ICSAAB se acaba de cambiar y se cerraron las sesiones abiertas.\nSi no fuiste tú, avisa de inmediato a la administradora del CRM.";
  return { subject, html, text };
}
