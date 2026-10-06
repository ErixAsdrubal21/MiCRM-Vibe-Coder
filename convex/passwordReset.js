import { internalAction, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Scrypt } from "lucia";
import { findUsersByEmailInsensitive } from "./lib.js";
import { canReceiveEmail, passwordChangedEmail, resetCodeEmail, sendEmail } from "./email.js";

/**
 * ICS-111 — recuperación de contraseña por código enviado al correo.
 *
 * Implementación propia en vez del flujo `reset` de Convex Auth, porque ese
 * flujo (a) responde distinto si la cuenta existe o no, (b) guarda el código
 * nuevo antes de que se pueda aplicar un límite de envíos y (c) queda expuesto
 * como ruta pública de `auth:signIn`. El cambio de contraseña escribe directo
 * en las tablas de Convex Auth (`authAccounts`, `authSessions`,
 * `authRefreshTokens`) con el mismo hash que usa su proveedor `Password`, para
 * poder hacerlo en una sola transacción con la revocación de sesiones.
 *
 * 1. `request(email)` — responde siempre igual y de inmediato; el trabajo se
 *    agenda (`processRequest`), así que ni la respuesta ni su tiempo revelan
 *    si la cuenta existe.
 * 2. `reserveCode` — una sola transacción: revisa y reserva el cupo de envíos
 *    y, solo si hay cupo y cuenta, reemplaza el código. Una solicitud
 *    bloqueada no toca el código vigente; las transacciones de Convex son
 *    serializables, así que solicitudes simultáneas no se saltan el límite.
 * 3. `confirm(email, code, newPassword)` — una sola transacción: valida el
 *    código (hash, vigencia, 5 intentos, un solo uso), cambia la contraseña,
 *    cierra todas las sesiones y agenda el aviso. Todo o nada. Cualquier
 *    código inválido da la misma respuesta, exista o no la cuenta.
 */

const CODE_MINUTES = 15;
const MIN_INTERVAL_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_ATTEMPTS_PER_CODE = 5;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

const normalizeEmail = (email) => email.trim().toLowerCase();

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** El hash incluye el correo para que dos cuentas con el mismo código no compartan hash. */
const hashCode = (email, code) => sha256Hex(`${email}:${code}`);

/** Código numérico de 8 dígitos, uniforme (rechazo de los valores que sesgarían el módulo 10). */
function randomCode(digits = 8) {
  const out = [];
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 10) * 10;
  while (out.length < digits) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) out.push(buf[0] % 10);
  }
  return out.join("");
}

async function passwordAccount(db, userId) {
  return db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
    .unique();
}

/** Paso 1 (público): pedir un código. Siempre `null`, exista o no la cuenta. */
export const request = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    if (normalized.length <= 254 && normalized.includes("@")) {
      await ctx.scheduler.runAfter(0, internal.passwordReset.processRequest, { email: normalized });
    }
    return null;
  },
});

export const processRequest = internalAction({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const code = randomCode();
    const reserved = await ctx.runMutation(internal.passwordReset.reserveCode, {
      email,
      codeHash: await hashCode(email, code),
      expiresAt: Date.now() + CODE_MINUTES * 60 * 1000,
    });
    if (!reserved) return;
    await sendEmail({ to: reserved.to, ...resetCodeEmail({ code, minutes: CODE_MINUTES }) });
  },
});

export const reserveCode = internalMutation({
  args: { email: v.string(), codeHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, { email, codeHash, expiresAt }) => {
    const now = Date.now();
    const history = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_email_and_time", (q) => q.eq("email", email))
      .collect();
    for (const old of history.filter((r) => r.requestedAt <= now - WINDOW_MS)) await ctx.db.delete(old._id);
    const recent = history.filter((r) => r.requestedAt > now - WINDOW_MS);
    if (recent.some((r) => r.requestedAt > now - MIN_INTERVAL_MS) || recent.length >= MAX_REQUESTS_PER_HOUR) {
      return null; // sin cupo: el código vigente se conserva
    }
    await ctx.db.insert("passwordResetRequests", { email, requestedAt: now });

    const matches = await findUsersByEmailInsensitive(ctx.db, email);
    if (matches.length !== 1 || !matches[0].role) return null;
    const user = matches[0];
    if (!(await passwordAccount(ctx.db, user._id)) || !canReceiveEmail(user.email)) return null;

    const previous = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const row of previous) await ctx.db.delete(row._id);
    await ctx.db.insert("passwordResetCodes", { email, userId: user._id, codeHash, expiresAt, attempts: 0 });
    return { to: user.email };
  },
});

/**
 * Paso 3 (público): código + contraseña nueva, en UNA sola transacción:
 * valida el código, guarda la contraseña nueva (mismo hash que Convex Auth:
 * Scrypt de `lucia`), borra todas las sesiones y sus refresh tokens, consume
 * el código y agenda el aviso. Si algo falla a medio camino, Convex revierte
 * todo: el código sigue sirviendo y nada cambia. Por eso un código incorrecto
 * se responde con `{ ok: false }` en vez de lanzar error — así sí se guarda
 * el intento fallido.
 */
export const confirm = mutation({
  args: { email: v.string(), code: v.string(), newPassword: v.string() },
  handler: async (ctx, { email, code, newPassword }) => {
    if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      return { ok: false, reason: "INVALID_PASSWORD" };
    }
    const normalized = normalizeEmail(email);
    const row = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (!row) return { ok: false, reason: "INVALID_CODE" };
    if (row.expiresAt <= Date.now() || row.attempts >= MAX_ATTEMPTS_PER_CODE) {
      await ctx.db.delete(row._id);
      return { ok: false, reason: "INVALID_CODE" };
    }
    if (row.codeHash !== (await hashCode(normalized, code.trim()))) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS_PER_CODE) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { attempts });
      return { ok: false, reason: "INVALID_CODE" };
    }

    const user = await ctx.db.get(row.userId);
    const account = user ? await passwordAccount(ctx.db, user._id) : null;
    if (!user || !account) {
      await ctx.db.delete(row._id);
      return { ok: false, reason: "INVALID_CODE" };
    }

    await ctx.db.patch(account._id, { secret: await new Scrypt().hash(newPassword) });
    failpoint("after_password_change");
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    failpoint("after_sessions_revoked");
    await ctx.db.delete(row._id); // un solo uso
    // El aviso solo se agenda si la transacción se confirma; si el correo falla después, el cambio ya quedó hecho.
    await ctx.scheduler.runAfter(0, internal.passwordReset.sendChangedNotice, { to: user.email });
    return { ok: true, loginEmail: account.providerAccountId };
  },
});

/**
 * Punto de falla para pruebas: si `PASSWORD_RESET_FAILPOINT` (entorno de
 * Convex) coincide, lanza error a media transacción para comprobar que
 * Convex revierte todo. Nunca se define en producción.
 */
function failpoint(name) {
  if (process.env.PASSWORD_RESET_FAILPOINT === name) {
    throw new Error(`Falla simulada (${name}).`);
  }
}

export const sendChangedNotice = internalAction({
  args: { to: v.string() },
  handler: async (_ctx, { to }) => {
    if (canReceiveEmail(to)) await sendEmail({ to, ...passwordChangedEmail() });
  },
});
