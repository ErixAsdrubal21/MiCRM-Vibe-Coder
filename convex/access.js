/**
 * ICS-117/118 — operaciones de acceso compartidas. Se llaman siempre dentro
 * de una mutation, así que cada vía que las usa (desactivar, quitar Google,
 * recuperar contraseña) aplica todo junto o nada.
 */

/** Cierra todas las sesiones de la persona (y sus refresh tokens), salvo `exceptSessionId`. */
export async function deleteUserSessions(db, userId, exceptSessionId = null) {
  const sessions = await db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect();
  for (const session of sessions) {
    if (session._id === exceptSessionId) continue;
    const tokens = await db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).collect();
    for (const token of tokens) await db.delete(token._id);
    await db.delete(session._id);
  }
}

/**
 * Quita la vinculación con Google y apaga el permiso (`googleAllowed`), para
 * que el siguiente login con Google no la vuelva a crear por correo. Borra
 * también los códigos de verificación OAuth pendientes de esa vinculación: un
 * login de Google que estaba a medias ya no puede completarse.
 */
export async function unlinkGoogle(db, userId) {
  const accounts = await db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "google"))
    .collect();
  for (const account of accounts) {
    const codes = await db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).collect();
    for (const code of codes) await db.delete(code._id);
    await db.delete(account._id);
  }
  await db.patch(userId, { googleAllowed: false });
}

/** Borra los códigos de recuperación de contraseña pendientes de un correo. */
export async function deletePasswordResetCodes(db, email) {
  if (!email) return;
  const codes = await db
    .query("passwordResetCodes")
    .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
    .collect();
  for (const code of codes) await db.delete(code._id);
}

/** Cuenta de contraseña de la persona (o null). */
export async function passwordAccountOf(db, userId) {
  return db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
    .unique();
}

/**
 * ICS-120 — límite de intentos con la contraseña equivocada, en la misma tabla
 * y con la misma regla que el login de Convex Auth (`authRateLimits`, por
 * cuenta, 10 por hora que se recuperan poco a poco), así que el login y
 * "Cambiar contraseña" comparten el contador.
 */
const MAX_FAILED_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

async function rateLimitRow(db, accountId) {
  return db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", accountId)).unique();
}

function attemptsLeftOf(row, now) {
  if (!row) return MAX_FAILED_PER_HOUR;
  return Math.min(MAX_FAILED_PER_HOUR, row.attemptsLeft + (now - row.lastAttemptTime) * (MAX_FAILED_PER_HOUR / HOUR_MS));
}

export async function tooManyFailedPasswordAttempts(db, accountId) {
  return attemptsLeftOf(await rateLimitRow(db, accountId), Date.now()) < 1;
}

export async function recordFailedPasswordAttempt(db, accountId) {
  const now = Date.now();
  const row = await rateLimitRow(db, accountId);
  if (row) await db.patch(row._id, { attemptsLeft: attemptsLeftOf(row, now) - 1, lastAttemptTime: now });
  else await db.insert("authRateLimits", { identifier: accountId, attemptsLeft: MAX_FAILED_PER_HOUR - 1, lastAttemptTime: now });
}

export async function resetFailedPasswordAttempts(db, accountId) {
  const row = await rateLimitRow(db, accountId);
  if (row) await db.delete(row._id);
}
