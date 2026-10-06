import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { recordTimelineEvent, syncPendingFollowUpOwner, syncOpenOpportunitiesOwner } from "./lib";

const SMOKE_PREFIXES = [
  "[SMOKE ICS-92]",
  "[SMOKE ICS-85]",
  "[SMOKE ICS-79]",
  "[SMOKE ICS-80]",
  "[SMOKE ICS-81]",
  "[SMOKE ICS-100]",
  "[SMOKE ICS-101]",
  "[SMOKE VENTAS]",
];

/** Rechaza cualquier id cuyo prospecto no sea de prueba (o no exista). */
async function requireSmokeProspect(ctx, id) {
  const prospect = await ctx.db.get(id);
  if (!prospect) throw new Error(`Prospecto ${id} no existe.`);
  if (!SMOKE_PREFIXES.some((p) => prospect.name.startsWith(p))) {
    throw new Error(`Rechazado: "${prospect.name}" no es un prospecto de prueba.`);
  }
  return prospect;
}

/**
 * Solo para smoke tests / limpieza manual — `internalMutation`, nunca expuesta
 * a la app. Borra un prospecto y TODO lo que cuelga de él (interacciones,
 * seguimientos, ventas, eventos de línea de tiempo). Correr con el deploy key:
 *   npx convex run testHelpers:deleteProspectCascade '{"id":"<prospectId>"}'
 *
 * Guarda de seguridad: solo borra prospectos cuyo nombre empieza con el prefijo
 * de datos de prueba — un id equivocado no puede llevarse un cliente real.
 */
export const deleteProspectCascade = internalMutation({
  args: { id: v.id("prospects") },
  handler: async (ctx, { id }) => {
    const prospect = await ctx.db.get(id);
    if (prospect && !SMOKE_PREFIXES.some((p) => prospect.name.startsWith(p))) {
      throw new Error(
        `Rechazado: "${prospect.name}" no es un prospecto de prueba (prefijos válidos: ${SMOKE_PREFIXES.join(", ")}).`,
      );
    }

    const tables = /** @type {const} */ ([
      ["interactions", "by_prospect"],
      ["followUps", "by_prospect"],
      ["sales", "by_prospect"],
      ["timelineEvents", "by_prospect_and_at"],
      ["opportunities", "by_prospect"],
    ]);
    let deleted = 0;
    for (const [table, index] of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex(index, (q) => q.eq("prospectId", id))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    if (prospect) {
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted };
  },
});

/**
 * ICS-85 — siembra una línea de tiempo variada para el smoke de
 * `timeline.listByProspect`. La escritura real de eventos desde las mutations
 * es ICS-79/ICS-80; hasta entonces este helper es la única forma de ejercitar
 * la hidratación de los 4 tipos + el caso "interacción borrada".
 *
 * Deja: 3 interacciones (con evento `interaccion` cada una), 1 venta (evento
 * `venta`), 1 seguimiento cerrado (evento `cierre-seguimiento`), 1 evento
 * `cambio-etapa`; y marca la 2ª interacción como borrada (su evento queda en
 * la tabla pero no debe devolverse hidratado). Solo prospectos de prueba.
 */
export const seedTimelineForSmoke = internalMutation({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const prospect = await requireSmokeProspect(ctx, prospectId);
    const actorId = prospect.ownerId;
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const interactionIds = [];
    for (let i = 3; i >= 1; i--) {
      const at = now - i * DAY;
      const interactionId = await ctx.db.insert("interactions", {
        prospectId,
        at,
        type: "llamada",
        note: `Interacción de prueba ${4 - i}`,
        registeredBy: actorId,
        source: "manual",
      });
      interactionIds.push(interactionId);
      await recordTimelineEvent(ctx, { prospectId, at, type: "interaccion", actorId, interactionId });
    }

    // 2ª interacción: borrada — su evento permanece, la hidratación la omite.
    const deletedInteractionId = interactionIds[1];
    await ctx.db.patch(deletedInteractionId, { deletedAt: now, deletedBy: actorId });

    const saleId = await ctx.db.insert("sales", {
      prospectId,
      amount: 12345,
      product: "Producto de prueba",
      closedAt: now - 12 * 60 * 60 * 1000,
      closedBy: actorId,
    });
    await recordTimelineEvent(ctx, {
      prospectId,
      at: now - 12 * 60 * 60 * 1000,
      type: "venta",
      actorId,
      saleId,
    });

    const followUpId = await ctx.db.insert("followUps", {
      prospectId,
      at: now - 6 * 60 * 60 * 1000,
      type: "llamada",
      status: "completado",
      completedAt: now - 6 * 60 * 60 * 1000,
      completedBy: actorId,
      resolution: "hecho",
      ownerId: actorId,
    });
    await recordTimelineEvent(ctx, {
      prospectId,
      at: now - 6 * 60 * 60 * 1000,
      type: "cierre-seguimiento",
      actorId,
      followUpId,
    });

    await recordTimelineEvent(ctx, {
      prospectId,
      at: now - 2 * DAY,
      type: "cambio-etapa",
      actorId,
      fromStage: "contactado",
      toStage: "cotizacion",
    });

    return {
      deletedInteractionId,
      visibleInteractionEvents: interactionIds.length - 1,
      totalEvents: interactionIds.length + 3,
    };
  },
});

/** Todas las interacciones y seguimientos de un prospecto de prueba (incluye borrados/completados). */
export const dumpProspectForSmoke = internalQuery({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const prospect = await ctx.db.get(prospectId);
    if (!prospect || !SMOKE_PREFIXES.some((p) => prospect.name.startsWith(p))) {
      throw new Error("No es un prospecto de prueba.");
    }
    const [interactions, followUps, sales, timelineEvents] = await Promise.all([
      ctx.db.query("interactions").withIndex("by_prospect", (q) => q.eq("prospectId", prospectId)).collect(),
      ctx.db.query("followUps").withIndex("by_prospect", (q) => q.eq("prospectId", prospectId)).collect(),
      ctx.db.query("sales").withIndex("by_prospect", (q) => q.eq("prospectId", prospectId)).collect(),
      ctx.db.query("timelineEvents").withIndex("by_prospect_and_at", (q) => q.eq("prospectId", prospectId)).collect(),
    ]);
    return { interactions, followUps, sales, timelineEvents };
  },
});

/**
 * ICS-80 — no existe (aún) una mutation de reasignación de cartera. Este
 * helper simula lo que esa mutation debería hacer: cambiar `prospect.ownerId`
 * y, en el mismo paso, llamar a `syncPendingFollowUpOwner` para que el
 * seguimiento pendiente siga al nuevo dueño. Solo prospectos de prueba.
 */
export const reassignProspectForSmoke = internalMutation({
  args: { prospectId: v.id("prospects"), newOwnerId: v.id("users") },
  handler: async (ctx, { prospectId, newOwnerId }) => {
    await requireSmokeProspect(ctx, prospectId);
    await ctx.db.patch(prospectId, { ownerId: newOwnerId });
    await syncPendingFollowUpOwner(ctx, prospectId, newOwnerId);
    await syncOpenOpportunitiesOwner(ctx, prospectId, newOwnerId);
    const pending = await ctx.db
      .query("followUps")
      .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
      .filter((q) => q.eq(q.field("status"), "pendiente"))
      .first();
    const opportunities = await ctx.db
      .query("opportunities")
      .withIndex("by_prospect", (q) => q.eq("prospectId", prospectId))
      .collect();
    return {
      pendingFollowUpOwnerId: pending?.ownerId ?? null,
      opportunityOwnerIds: opportunities.map((o) => ({ id: o._id, stage: o.stage, ownerId: o.ownerId })),
    };
  },
});

/**
 * Solo para QA manual en un deployment de DESARROLLO sin ningún
 * administrador todavía (p. ej. el `dev` de este proyecto, que solo tenía
 * vendedores de prueba). Idempotente: si ya existe alguna fila `role:
 * "administrador"`, no hace nada. Nunca se llama contra producción — ahí
 * Marta ya está aprovisionada con contraseña real
 * (`scripts/provision-user.mjs`); este helper solo destraba QA local del
 * modo "open access" para el rol de administrador.
 *   npx convex run testHelpers:provisionDemoAdmin
 */
export const provisionDemoAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("users").collect();
    if (existing.some((u) => u.role === "administrador")) {
      return { created: false };
    }
    const id = await ctx.db.insert("users", {
      name: "Marta (demo)",
      email: "marta-demo@minegocio.com",
      role: "administrador",
    });
    return { created: true, id };
  },
});

/** ICS-108: los helpers de abajo solo tocan correos de prueba con este prefijo. */
const SMOKE_AUTH_PREFIX = "smoke-ics108";

/**
 * También acepta las direcciones de prueba de Resend (`…@resend.dev`): la
 * recuperación de contraseña (ICS-111) solo manda códigos a correos que sí
 * pueden recibir, y Resend las acepta sin entregar nada real.
 */
const isSmokeAuthEmail = (email) => {
  const e = email?.toLowerCase() ?? "";
  return e.startsWith(SMOKE_AUTH_PREFIX) || e.endsWith("@resend.dev");
};

function requireSmokeAuthEmail(email) {
  if (!isSmokeAuthEmail(email)) {
    throw new Error(`Rechazado: "${email}" no es un correo de prueba (${SMOKE_AUTH_PREFIX}…).`);
  }
}

/**
 * ICS-108 — inserta una fila `users` de prueba tal cual, sin pasar por
 * `createPendingUserRow`. Existe para poder sembrar casos que el flujo normal
 * ya impide (dos filas que solo difieren en mayúsculas) y comprobar que el
 * login con Google las rechaza. `role` es opcional aquí a propósito: el smoke
 * comprueba que el esquema de `users` rechaza una fila sin rol.
 */
export const insertSmokeAuthUser = internalMutation({
  args: { email: v.string(), role: v.optional(v.string()) },
  handler: async (ctx, { email, role }) => {
    requireSmokeAuthEmail(email);
    return ctx.db.insert("users", { email, name: "[SMOKE ICS-108]", ...(role ? { role } : {}) });
  },
});

/** ICS-108 — estado de auth de las filas de prueba, para las aserciones del smoke. */
export const dumpSmokeAuth = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.db.query("users").collect()).filter((u) =>
      isSmokeAuthEmail(u.email),
    );
    const out = [];
    for (const u of users) {
      const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", u._id)).collect();
      const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", u._id)).collect();
      out.push({
        _id: u._id,
        email: u.email,
        role: u.role ?? null,
        accounts: accounts.map((a) => `${a.provider}:${a.providerAccountId}`),
        sessions: sessions.length,
      });
    }
    return { totalUsers: (await ctx.db.query("users").collect()).length, smoke: out };
  },
});

/** ICS-108 — borra todas las filas de prueba y lo que Convex Auth cuelga de ellas. */
export const deleteSmokeAuthUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.db.query("users").collect()).filter((u) =>
      isSmokeAuthEmail(u.email),
    );
    for (const u of users) {
      const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", u._id)).collect();
      for (const a of accounts) {
        const codes = await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect();
        for (const c of codes) await ctx.db.delete(c._id);
        await ctx.db.delete(a._id);
      }
      const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", u._id)).collect();
      for (const s of sessions) {
        const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect();
        for (const t of tokens) await ctx.db.delete(t._id);
        await ctx.db.delete(s._id);
      }
      await ctx.db.delete(u._id);
    }
    for (const table of ["passwordResetCodes", "passwordResetRequests"]) {
      for (const row of await ctx.db.query(table).collect()) {
        if (isSmokeAuthEmail(row.email)) await ctx.db.delete(row._id);
      }
    }
    return { deleted: users.length };
  },
});

/**
 * ICS-111 — fija un código de recuperación conocido (por su hash) para un
 * correo de prueba, sin pasar por el correo. Permite probar el éxito, el
 * vencimiento, la reutilización y el límite de intentos sin leer una bandeja.
 */
export const setSmokeResetCode = internalMutation({
  args: { email: v.string(), codeHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, { email, codeHash, expiresAt }) => {
    requireSmokeAuthEmail(email);
    const normalized = email.trim().toLowerCase();
    const user = (await ctx.db.query("users").collect()).find((u) => u.email?.toLowerCase() === normalized);
    if (!user) throw new Error(`No existe usuario de prueba ${email}.`);
    for (const row of await ctx.db.query("passwordResetCodes").withIndex("by_email", (q) => q.eq("email", normalized)).collect()) {
      await ctx.db.delete(row._id);
    }
    return ctx.db.insert("passwordResetCodes", { email: normalized, userId: user._id, codeHash, expiresAt, attempts: 0 });
  },
});

/** ICS-111 — estado de recuperación de un correo de prueba: códigos vigentes y solicitudes registradas. */
export const dumpSmokeReset = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    requireSmokeAuthEmail(email);
    const normalized = email.trim().toLowerCase();
    const codes = await ctx.db.query("passwordResetCodes").withIndex("by_email", (q) => q.eq("email", normalized)).collect();
    const requests = await ctx.db.query("passwordResetRequests").withIndex("by_email_and_time", (q) => q.eq("email", normalized)).collect();
    return {
      codes: codes.map((c) => ({ _id: c._id, codeHash: c.codeHash, attempts: c.attempts, expiresAt: c.expiresAt })),
      requests: requests.length,
    };
  },
});
