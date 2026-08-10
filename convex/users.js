import { action, internalAction, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  createAccount,
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { requireAdministrador } from "./permissions";

const role = v.union(v.literal("administrador"), v.literal("vendedor"));

/**
 * ICS-6/7/8 — reemplaza loginMock. Sesión real vía Convex Auth: el cliente
 * ya no manda quién es, `getAuthUserId(ctx)` lo deriva del token de sesión.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
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

/** ICS-29: lista del equipo para la sección de Configuración de un administrador. */
export const listTeam = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrador(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role }));
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
    const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (existing) throw new Error("Ya existe una cuenta con ese correo.");
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
      throw new Error("Solo un administrador puede invitar usuarios.");
    }

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !trimmedName) {
      throw new Error("Correo y nombre son obligatorios.");
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
 * ICS-28: cambio de contraseña autenticado (cualquier rol). Exige la
 * contraseña actual antes de aceptar la nueva (defensa en profundidad: una
 * sesión robada sola no basta para tomar la cuenta permanentemente) e
 * invalida el resto de sesiones activas (`authSessions`) al terminar, mismo
 * patrón que usa internamente el propio flujo de reset de Convex Auth. Esto
 * bloquea que otras sesiones renueven su token, pero NO revoca de inmediato
 * un JWT de acceso ya emitido — Convex Auth los verifica por firma, sin
 * consultar la base en cada request (por diseño, para no perder la ventaja
 * de rendimiento de un JWT). Ventana de exposición acotada al TTL por
 * defecto del token (1h, `DEFAULT_JWT_DURATION_MS` en
 * @convex-dev/auth/server/implementation/tokens.js) — mismo tradeoff
 * estándar de cualquier auth basado en JWT de corta duración + refresh
 * revocable (Auth0, Firebase, etc.), no es una falla de esta implementación.
 */
export const changeOwnPassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const me = await ctx.runQuery(api.users.currentUser, {});
    if (!me) throw new Error("No autenticado.");
    if (!me.email) throw new Error("Tu cuenta no tiene un correo asociado.");
    if (newPassword.length < 8) {
      throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
    }

    try {
      await retrieveAccount(ctx, { provider: "password", account: { id: me.email, secret: currentPassword } });
    } catch {
      throw new Error("La contraseña actual no es correcta.");
    }

    await modifyAccountCredentials(ctx, { provider: "password", account: { id: me.email, secret: newPassword } });

    const sessionId = await getAuthSessionId(ctx);
    if (sessionId) {
      await invalidateSessions(ctx, { userId: me._id, except: [sessionId] });
    }

    return "ok";
  },
});
