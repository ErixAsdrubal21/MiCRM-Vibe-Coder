import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { createAccount, getAuthSessionId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { getActiveUserId, isActiveUser, requireAdministrador, requireAuthenticatedUser } from "./permissions";
import {
  deletePasswordResetCodes,
  deleteUserSessions,
  passwordAccountOf,
  recordFailedPasswordAttempt,
  resetFailedPasswordAttempts,
  tooManyFailedPasswordAttempts,
  unlinkGoogle,
} from "./access.js";
import { Scrypt } from "lucia";
import { logSecurityEvent } from "./securityEvents.js";
import { ACTIVE_STAGE_VALUES, OPPORTUNITY_OPEN_STAGES } from "../shared/crmEnums.js";
import { failpoint, findUsersByEmailInsensitive } from "./lib.js";
import { canReceiveEmail, emailChangedNewAddressEmail, emailChangedOldAddressEmail, googleLinkedEmail, sendEmail } from "./email.js";
import { role } from "./validators.js";

/**
 * ICS-6/7/8 — reemplaza loginMock. Sesión real vía Convex Auth: el cliente
 * ya no manda quién es, se deriva del token de sesión. ICS-111: solo si la
 * sesión sigue viva (`getActiveUserId`), así que una sesión cerrada por un
 * cambio de contraseña deja de ver datos de inmediato, también en las
 * actions que se apoyan en esta query.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
    return userId ? ctx.db.get(userId) : null;
  },
});

/**
 * Aprovisiona la credencial de Password para una fila de `users` que ya
 * existe (Carlos o Marta) — nunca crea un usuario. `createAccount` exige
 * contexto de action (no de mutation: internamente hace ctx.runMutation).
 * La verificación de "el email ya debe existir" no se repite aquí — la
 * hace `createOrUpdateUser` (convex/auth.js), que createAccount dispara
 * internamente; duplicarla aquí sería una segunda fuente de la misma regla.
 * Solo se llama desde `scripts/provision-user.mjs`, corrido localmente por
 * un humano con acceso al proyecto; nunca se expone como función pública ni
 * se llama desde la UI.
 */
export const provisionPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }) => {
    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email },
    });
    return "ok";
  },
});

/**
 * "Break glass" — restablece la contraseña de una cuenta existente por
 * correo, SIN exigir una sesión de administrador ya activa (a diferencia de
 * `resetUserPassword`, que sí la exige). Existe para el caso en que el
 * ÚNICO administrador pierde su propia contraseña: nadie más puede usar el
 * flujo normal (Configuración → Equipo → restablecer) para desbloquearlo.
 *
 * Como `provisionPassword`: `internalAction`, nunca expuesta a la UI ni al
 * cliente — solo se llama con el deploy key, corriendo localmente
 * `scripts/reset-user-password.mjs` (prompt oculto, la contraseña nunca
 * pasa por un argumento de shell ni por un chat/IA). Invalida las sesiones
 * activas del usuario, igual que `resetUserPassword`.
 */
export const resetPasswordByEmail = internalAction({
  args: { email: v.string(), newPassword: v.string() },
  handler: async (ctx, { email, newPassword }) => {
    await ctx.runMutation(internal.users.applyPasswordByEmail, { email, secret: await new Scrypt().hash(newPassword) });
    return "ok";
  },
});

/** ICS-120 — la parte transaccional de `resetPasswordByEmail`: contraseña, sesiones y códigos juntos. */
export const applyPasswordByEmail = internalMutation({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, { email, secret }) => {
    const matches = await findUsersByEmailInsensitive(ctx.db, email);
    if (matches.length !== 1) throw new ConvexError(`Se esperaba exactamente una cuenta con el correo ${email}; hay ${matches.length}.`);
    const user = matches[0];
    const account = await passwordAccountOf(ctx.db, user._id);
    if (!account) throw new ConvexError(`La cuenta ${email} no tiene contraseña.`);
    await ctx.db.patch(account._id, { secret });
    await deleteUserSessions(ctx.db, user._id);
    await deletePasswordResetCodes(ctx.db, user.email);
    await resetFailedPasswordAttempts(ctx.db, account._id);
    await logSecurityEvent(ctx.db, { type: "password_reset_emergency", targetUserId: user._id, details: { via: "script" } });
    return null;
  },
});

/**
 * ICS-131 — cambio del correo de acceso, en la misma transacción que lo llama:
 * actualiza `users.email` y el `providerAccountId` de su contraseña (el
 * correo con el que se escribe en el login), borra sus códigos de
 * recuperación del correo viejo, quita Google (esa cuenta de Google era del
 * correo viejo; convex/access.js `unlinkGoogle`), cierra todas sus sesiones,
 * lo registra en la bitácora y agenda un aviso a la dirección vieja y a la
 * nueva. Devuelve null si el correo no cambia.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function applyEmailChange(ctx, user, rawEmail, { actorId, via } = {}) {
  const newEmail = rawEmail.trim().toLowerCase();
  if (newEmail.length > 254 || !EMAIL_RE.test(newEmail)) throw new ConvexError("Escribe un correo válido.");
  const oldEmail = user.email ?? "";
  if (oldEmail.toLowerCase() === newEmail) return null;
  const taken = (await findUsersByEmailInsensitive(ctx.db, newEmail)).filter((u) => u._id !== user._id);
  if (taken.length > 0) throw new ConvexError("Ya existe una cuenta con ese correo.");

  await ctx.db.patch(user._id, { email: newEmail });
  const account = await passwordAccountOf(ctx.db, user._id);
  if (account) await ctx.db.patch(account._id, { providerAccountId: newEmail });
  failpoint("email_change_after_patch");
  await deletePasswordResetCodes(ctx.db, oldEmail);
  const googleRemoved = await unlinkGoogle(ctx.db, user._id);
  await deleteUserSessions(ctx.db, user._id);
  await logSecurityEvent(ctx.db, {
    type: "email_changed",
    targetUserId: user._id,
    ...(actorId ? { actorId } : {}),
    details: { googleRemoved, ...(via ? { via } : {}) },
  });
  await ctx.scheduler.runAfter(0, internal.users.sendEmailChangedNotices, { oldEmail, newEmail });
  return { userId: user._id, email: newEmail, passwordUpdated: Boolean(account) };
}

function validName(raw) {
  const name = raw.trim();
  if (name.length < 1) throw new ConvexError("El nombre no puede estar vacío.");
  if (name.length > 80) throw new ConvexError("El nombre no puede tener más de 80 caracteres.");
  return name;
}

/**
 * ICS-131 — editar el nombre y/o el correo de un miembro (solo administrador),
 * en una sola transacción. El nombre se puede cambiar a cualquiera, también a
 * sí misma. El correo NO se cambia a sí misma desde aquí: sin una segunda
 * verificación, una sesión robada bastaría para quedarse con la cuenta; ese
 * cambio lo hace otra administradora o el script `changeUserEmail`.
 */
export const updateMember = mutation({
  args: { userId: v.id("users"), name: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, { userId, name, email }) => {
    const me = await requireAdministrador(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("Usuario no encontrado.");
    if (name !== undefined) {
      const clean = validName(name);
      if (clean !== target.name) await ctx.db.patch(userId, { name: clean });
    }
    if (email !== undefined && email.trim().toLowerCase() !== (target.email ?? "").toLowerCase()) {
      if (userId === me._id) {
        throw new ConvexError("Tu propio correo no se cambia desde aquí. Pídelo a otra administradora o a soporte.");
      }
      await applyEmailChange(ctx, target, email, { actorId: me._id });
    }
    return null;
  },
});

/** ICS-131 — cada persona puede cambiar su propio nombre (cualquier rol). */
export const updateOwnName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const me = await requireAuthenticatedUser(ctx);
    const clean = validName(name);
    if (clean !== me.name) await ctx.db.patch(me._id, { name: clean });
    return null;
  },
});

/**
 * ICS-108 / ICS-131 — cambio de correo por soporte (`npx convex run
 * users:changeUserEmail '{"from":"…","to":"…"}'`), nunca desde la UI. Mismas
 * reglas que `updateMember` (quita Google, cierra sesiones, avisa y lo
 * registra en la bitácora como script).
 */
export const changeUserEmail = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const matches = await findUsersByEmailInsensitive(ctx.db, from);
    if (matches.length !== 1) throw new ConvexError(`Se esperaba exactamente una cuenta con el correo ${from}; hay ${matches.length}.`);
    const result = await applyEmailChange(ctx, matches[0], to, { via: "script" });
    if (!result) throw new ConvexError("El correo nuevo es igual al actual.");
    return result;
  },
});

/** ICS-131 — avisos de cambio de correo a la dirección vieja y a la nueva. */
export const sendEmailChangedNotices = internalAction({
  args: { oldEmail: v.string(), newEmail: v.string() },
  handler: async (_ctx, { oldEmail, newEmail }) => {
    if (oldEmail && canReceiveEmail(oldEmail)) await sendEmail({ to: oldEmail, ...emailChangedOldAddressEmail({ newEmail }) });
    if (canReceiveEmail(newEmail)) await sendEmail({ to: newEmail, ...emailChangedNewAddressEmail() });
  },
});

/** ICS-29: lista del equipo para la sección de Configuración de un administrador. */
export const listTeam = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrador(ctx);
    const users = await ctx.db.query("users").collect();
    const googleAccounts = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", "google")).collect();
    const linked = new Set(googleAccounts.map((a) => a.userId));
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      disabledAt: u.disabledAt ?? null,
      googleAllowed: Boolean(u.googleAllowed),
      googleLinked: linked.has(u._id),
    }));
  },
});

/**
 * ICS-117 — desactivar una cuenta (solo administrador). Todo en esta única
 * mutation, así que se aplica completo o nada: marca `disabledAt`, cierra
 * todas sus sesiones (y sus refresh tokens), borra sus códigos de
 * recuperación pendientes y quita su vinculación y su permiso de Google. A partir de
 * aquí no puede entrar por ningún medio (`isActiveUser` en convex/auth.js y
 * convex/permissions.js) ni recuperar su contraseña. Sus datos del CRM
 * (prospectos, ventas, historial) no se tocan.
 *
 * Nunca deja el CRM sin administradora activa: nadie puede desactivarse a sí
 * mismo, y quien llama debe ser una administradora activa. Si dos
 * administradoras se desactivan una a otra al mismo tiempo, Convex serializa
 * las dos mutations: la segunda se reintenta, ve que quien la llama ya está
 * desactivada y la rechaza `requireAdministrador`. El conteo de abajo es una
 * defensa extra por si esa regla cambiara.
 */
export const deactivateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await requireAdministrador(ctx);
    if (userId === me._id) throw new ConvexError("No puedes desactivar tu propia cuenta.");
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("Usuario no encontrado.");
    if (target.disabledAt) return null;

    if (target.role === "administrador") {
      const activeAdmins = (await ctx.db.query("users").collect()).filter(
        (u) => u.role === "administrador" && isActiveUser(u),
      );
      if (activeAdmins.filter((u) => u._id !== userId).length === 0) {
        throw new ConvexError("El CRM debe conservar al menos una administradora activa.");
      }
    }

    await ctx.db.patch(userId, { disabledAt: Date.now() });
    await deleteUserSessions(ctx.db, userId);
    failpoint("deactivate_after_sessions");
    await deletePasswordResetCodes(ctx.db, target.email);
    const googleRemoved = await unlinkGoogle(ctx.db, userId);
    await logSecurityEvent(ctx.db, { type: "user_deactivated", actorId: me._id, targetUserId: userId, details: { googleRemoved } });
    return null;
  },
});

/**
 * ICS-117 — reactivar una cuenta desactivada (solo administrador). Solo quita
 * `disabledAt`: no restaura sesiones, códigos ni Google (desactivar apagó
 * `googleAllowed`; una administradora lo vuelve a permitir aparte si hace
 * falta). La persona entra con su contraseña de siempre o pide un
 * restablecimiento.
 */
export const reactivateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await requireAdministrador(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("Usuario no encontrado.");
    if (target.disabledAt) {
      await ctx.db.patch(userId, { disabledAt: undefined });
      await logSecurityEvent(ctx.db, { type: "user_reactivated", actorId: me._id, targetUserId: userId });
    }
    return null;
  },
});

/**
 * ICS-130 — cambiar el rol de un miembro (solo administrador), en una sola
 * transacción: cambia el rol, cierra todas las sesiones de la persona (sus
 * pantallas y permisos cambian) y lo registra en la bitácora.
 *
 * - Nadie cambia su propio rol, y nunca queda el CRM sin administradora
 *   activa (si dos administradoras se degradan una a otra al mismo tiempo,
 *   la segunda se reintenta y la rechaza `requireAdministrador`, como en
 *   `deactivateUser`).
 * - Una cuenta desactivada se reactiva primero.
 * - Decisión de la usuaria (2026-10-20, opción A): un vendedor con prospectos
 *   activos u oportunidades abiertas no puede pasar a administrador — como
 *   administrador ya no podría operarlos. Hoy el CRM no tiene reasignación de
 *   cartera, así que solo se permite si todo lo suyo está cerrado.
 */
export const changeUserRole = mutation({
  args: { userId: v.id("users"), role },
  handler: async (ctx, { userId, role: newRole }) => {
    const me = await requireAdministrador(ctx);
    if (userId === me._id) throw new ConvexError("No puedes cambiar tu propio rol.");
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("Usuario no encontrado.");
    if (target.disabledAt) throw new ConvexError("Esa cuenta está desactivada. Reactívala antes de cambiarle el rol.");
    if (target.role === newRole) return null;

    if (target.role === "administrador") {
      const activeAdmins = (await ctx.db.query("users").collect()).filter((u) => u.role === "administrador" && isActiveUser(u));
      if (activeAdmins.filter((u) => u._id !== userId).length === 0) {
        throw new ConvexError("El CRM debe conservar al menos una administradora activa.");
      }
    }
    if (newRole === "administrador") {
      const prospects = await ctx.db.query("prospects").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
      const activeProspects = prospects.filter((p) => ACTIVE_STAGE_VALUES.includes(p.stage)).length;
      const opportunities = await ctx.db.query("opportunities").withIndex("by_owner_and_stage", (q) => q.eq("ownerId", userId)).collect();
      const openOpportunities = opportunities.filter((o) => OPPORTUNITY_OPEN_STAGES.includes(o.stage)).length;
      if (activeProspects > 0 || openOpportunities > 0) {
        const parts = [];
        if (activeProspects > 0) parts.push(`${activeProspects} prospecto${activeProspects === 1 ? "" : "s"} activo${activeProspects === 1 ? "" : "s"}`);
        if (openOpportunities > 0) parts.push(`${openOpportunities} oportunidad${openOpportunities === 1 ? "" : "es"} abierta${openOpportunities === 1 ? "" : "s"}`);
        throw new ConvexError(
          `${target.name ?? "Esta persona"} tiene ${parts.join(" y ")}. Como administradora ya no podría operarlos; ciérralos antes de cambiarle el rol.`,
        );
      }
    }

    await ctx.db.patch(userId, { role: newRole });
    failpoint("change_role_after_patch");
    await deleteUserSessions(ctx.db, userId);
    await logSecurityEvent(ctx.db, {
      type: "role_changed",
      actorId: me._id,
      targetUserId: userId,
      details: { fromRole: target.role, toRole: newRole },
    });
    return null;
  },
});

/**
 * ICS-118 — permitir o quitar el acceso con Google (solo administrador,
 * también sobre su propia cuenta). Permitir solo marca `googleAllowed`; la
 * vinculación se crea cuando la persona entra con una cuenta de Google con
 * su mismo correo (convex/auth.js `resolveSignInUser`). Quitar, en la misma
 * transacción: borra la vinculación y los códigos OAuth pendientes, apaga el
 * permiso y cierra todas las sesiones de la persona —las sesiones no
 * registran con qué se entró—, salvo la de quien lo hace si es su propia
 * cuenta.
 */
export const setGoogleAllowed = mutation({
  args: { userId: v.id("users"), allowed: v.boolean() },
  handler: async (ctx, { userId, allowed }) => {
    const me = await requireAdministrador(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("Usuario no encontrado.");
    if (allowed) {
      if (!isActiveUser(target)) throw new ConvexError("Esa cuenta está desactivada. Reactívala antes de permitirle Google.");
      if (!target.googleAllowed) {
        await ctx.db.patch(userId, { googleAllowed: true });
        await logSecurityEvent(ctx.db, { type: "google_allowed", actorId: me._id, targetUserId: userId });
      }
      return null;
    }
    const removed = await unlinkGoogle(ctx.db, userId);
    await deleteUserSessions(ctx.db, userId, userId === me._id ? await getAuthSessionId(ctx) : null);
    if (removed) await logSecurityEvent(ctx.db, { type: "google_removed", actorId: me._id, targetUserId: userId });
    return null;
  },
});

/**
 * ICS-118 — lo mismo que `setGoogleAllowed`, por correo y sin sesión de
 * administrador: solo para la migración y soporte (`npx convex run
 * users:setGoogleAllowedByEmail`), nunca desde la UI.
 */
export const setGoogleAllowedByEmail = internalMutation({
  args: { email: v.string(), allowed: v.boolean() },
  handler: async (ctx, { email, allowed }) => {
    const matches = await findUsersByEmailInsensitive(ctx.db, email);
    if (matches.length !== 1) throw new ConvexError(`Se esperaba exactamente una cuenta con el correo ${email}; hay ${matches.length}.`);
    const user = matches[0];
    if (allowed) {
      if (!isActiveUser(user)) throw new ConvexError(`La cuenta ${email} está desactivada.`);
      if (!user.googleAllowed) {
        await ctx.db.patch(user._id, { googleAllowed: true });
        await logSecurityEvent(ctx.db, { type: "google_allowed", targetUserId: user._id, details: { via: "script" } });
      }
    } else {
      const removed = await unlinkGoogle(ctx.db, user._id);
      await deleteUserSessions(ctx.db, user._id);
      if (removed) await logSecurityEvent(ctx.db, { type: "google_removed", targetUserId: user._id, details: { via: "script" } });
    }
    return { userId: user._id, googleAllowed: allowed };
  },
});

/** ICS-119 — aviso por correo de una vinculación nueva de Google (lo agenda convex/auth.js). */
export const sendGoogleLinkedNotice = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.runQuery(internal.users.getUserById, { userId });
    if (user?.email && canReceiveEmail(user.email)) await sendEmail({ to: user.email, ...googleLinkedEmail() });
  },
});

/**
 * Fila `users` de un invitado, sin credencial todavía. Existencia + inserción
 * en una sola mutation (transaccional) para que dos invitaciones concurrentes
 * al mismo correo no puedan colarse las dos — `inviteUser` no podría dar esa
 * garantía llamando una query y luego una mutation por separado.
 */
export const createPendingUserRow = internalMutation({
  args: { email: v.string(), name: v.string(), role },
  handler: async (ctx, { email, name, role: userRole }) => {
    const existing = await findUsersByEmailInsensitive(ctx.db, email);
    if (existing.length > 0) throw new ConvexError("Ya existe una cuenta con ese correo.");
    return ctx.db.insert("users", { email, name, role: userRole });
  },
});

/** Reversa de `createPendingUserRow` si `createAccount` falla después — evita dejar un usuario huérfano sin credencial. */
export const deletePendingUserRow = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.delete(userId);
  },
});

function generateTempPassword() {
  // Alfabeto sin caracteres ambiguos (0/O, 1/l/I) — se muestra una sola vez para copiar a mano.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * ICS-29: invitar un miembro nuevo al equipo (solo administrador). No toca
 * `createOrUpdateUser` (convex/auth.js) — reutiliza su regla ya aprobada
 * ("vincula por email si la fila `users` ya existe, si no rechaza") en vez de
 * abrir una ruta nueva de autoregistro: primero se inserta la fila `users`
 * del invitado, y solo entonces `createAccount` la encuentra por email y le
 * vincula la credencial. Rechaza correos que ya tienen cuenta — invitar de
 * nuevo un correo activo sería la misma toma de cuenta por pre-registro que
 * ya se cerró en el provider `Password` (ver convex/auth.js).
 */
export const inviteUser = action({
  args: { email: v.string(), name: v.string(), role },
  handler: async (ctx, { email, name, role: userRole }) => {
    const me = await ctx.runQuery(api.users.currentUser, {});
    if (!me || me.role !== "administrador") {
      throw new ConvexError("Solo un administrador puede invitar usuarios.");
    }

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !trimmedName) {
      throw new ConvexError("Correo y nombre son obligatorios.");
    }

    const newUserId = await ctx.runMutation(internal.users.createPendingUserRow, {
      email: trimmedEmail,
      name: trimmedName,
      role: userRole,
    });

    const tempPassword = generateTempPassword();
    try {
      await createAccount(ctx, {
        provider: "password",
        account: { id: trimmedEmail, secret: tempPassword },
        profile: { email: trimmedEmail },
      });
    } catch (err) {
      await ctx.runMutation(internal.users.deletePendingUserRow, { userId: newUserId });
      throw err;
    }

    return { tempPassword };
  },
});

/**
 * ICS-28 / ICS-120: cambio de contraseña autenticado (cualquier rol). La
 * action solo traduce el resultado; todo pasa en `changeOwnPasswordTx`, una
 * sola mutation: verifica la contraseña actual, guarda la nueva (mismo hash
 * que Convex Auth: Scrypt de `lucia`), borra los códigos de recuperación
 * pendientes y cierra las demás sesiones —la actual sigue abierta—. Todo o
 * nada. Conserva Google (ICS-118: es la propia persona, con su contraseña).
 *
 * Una contraseña actual equivocada no cambia nada y cuenta para el mismo
 * límite de intentos que el login (convex/access.js); por eso la mutation
 * devuelve el resultado en vez de lanzar error: lanzar desharía también el
 * registro del intento fallido.
 */
const CHANGE_PASSWORD_ERRORS = {
  WRONG_PASSWORD: "La contraseña actual no es correcta.",
  TOO_MANY_ATTEMPTS: "Demasiados intentos con una contraseña incorrecta. Espera unos minutos y vuelve a intentarlo.",
  INVALID_PASSWORD: "La nueva contraseña debe tener entre 8 y 128 caracteres.",
  NO_PASSWORD: "Tu cuenta no tiene contraseña. Pide a una administradora que te la restablezca.",
};

export const changeOwnPassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(internal.users.changeOwnPasswordTx, args);
    if (!result.ok) throw new ConvexError(CHANGE_PASSWORD_ERRORS[result.reason]);
    return "ok";
  },
});

export const changeOwnPasswordTx = internalMutation({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const me = await requireAuthenticatedUser(ctx);
    if (newPassword.length < 8 || newPassword.length > 128) return { ok: false, reason: "INVALID_PASSWORD" };
    const account = await passwordAccountOf(ctx.db, me._id);
    if (!account) return { ok: false, reason: "NO_PASSWORD" };
    if (await tooManyFailedPasswordAttempts(ctx.db, account._id)) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
    if (!(await new Scrypt().verify(account.secret ?? "", currentPassword))) {
      await recordFailedPasswordAttempt(ctx.db, account._id);
      return { ok: false, reason: "WRONG_PASSWORD" };
    }

    await ctx.db.patch(account._id, { secret: await new Scrypt().hash(newPassword) });
    failpoint("change_own_after_password");
    await resetFailedPasswordAttempts(ctx.db, account._id);
    await deletePasswordResetCodes(ctx.db, me.email);
    await deleteUserSessions(ctx.db, me._id, await getAuthSessionId(ctx));
    await logSecurityEvent(ctx.db, { type: "password_changed", actorId: me._id, targetUserId: me._id });
    return { ok: true };
  },
});

/** Fila `users` por id — para actions, que no tienen `ctx.db` (p. ej. `sendGoogleLinkedNotice`). */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});

/**
 * "Olvidé mi contraseña", versión sin correo (hallazgo de auditoría PRD↔app,
 * 2026-09-13): el sistema es cerrado — sin autoregistro, sin proveedor de
 * email transaccional configurado — así que no hay a dónde mandar un enlace
 * de recuperación. La recuperación real es la misma que ya usa `inviteUser`:
 * un administrador genera una contraseña temporal y se la comparte fuera del
 * sistema (verbalmente, por WhatsApp, etc.); el usuario la cambia por la
 * suya con `changeOwnPassword` en su próximo login. El login expone esto
 * como "pide a tu administrador que te la restablezca", no como un enlace
 * de autoservicio — no prometer lo que el sistema no hace.
 *
 * Reemplaza el secreto de la cuenta `password` sin necesitar la contraseña
 * anterior (a diferencia de `changeOwnPassword`, que sí la exige porque la
 * persona actúa sobre sí misma). Cierra TODAS las sesiones de la persona —una
 * contraseña que solo conoce la administradora no debe dejar sesiones vivas—,
 * quita Google (ICS-118) y borra sus códigos de recuperación pendientes
 * (ICS-120): un código pedido antes ya no sirve.
 */
export const resetUserPassword = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // ICS-120: la contraseña temporal se genera aquí (una action tiene azar
    // real) y la mutation `applyAdminPasswordReset` hace todo lo demás junto:
    // permisos, contraseña, Google, sesiones y códigos. Si algo falla, nada
    // cambia y la contraseña temporal nunca se muestra.
    const tempPassword = generateTempPassword();
    await ctx.runMutation(internal.users.applyAdminPasswordReset, { userId, secret: await new Scrypt().hash(tempPassword) });
    return { tempPassword };
  },
});

export const applyAdminPasswordReset = internalMutation({
  args: { userId: v.id("users"), secret: v.string() },
  handler: async (ctx, { userId, secret }) => {
    const me = await requireAuthenticatedUser(ctx);
    if (me.role !== "administrador") throw new ConvexError("Solo un administrador puede restablecer contraseñas.");
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("Usuario no encontrado.");
    if (target.disabledAt) throw new ConvexError("Esa cuenta está desactivada. Reactívala antes de restablecer su contraseña.");
    const account = await passwordAccountOf(ctx.db, userId);
    if (!account) throw new ConvexError("Ese usuario no tiene contraseña que restablecer.");

    await ctx.db.patch(account._id, { secret });
    failpoint("admin_reset_after_password");
    // ICS-118: restablecer desde administración también quita Google.
    const googleRemoved = await unlinkGoogle(ctx.db, userId);
    await deleteUserSessions(ctx.db, userId);
    await deletePasswordResetCodes(ctx.db, target.email);
    await resetFailedPasswordAttempts(ctx.db, account._id);
    await logSecurityEvent(ctx.db, { type: "password_reset_admin", actorId: me._id, targetUserId: userId, details: { googleRemoved } });
    return null;
  },
});
