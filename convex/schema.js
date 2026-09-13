import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  stage,
  contactType,
  followUpType,
  channel,
  lossReason,
  role,
  outcome,
  resolution,
  interactionSource,
  timelineEventType,
  opportunityStage,
} from "./validators.js";

/**
 * Modelo de datos del CRM — espejo del esquema mock de `mi-crm` (ICS-5),
 * normalizado para Convex (tablas + referencias por _id en vez de arrays
 * embebidos). Los nombres de etapa, tipos de contacto, etc. viven en
 * `shared/crmEnums.js` y se validan con `v.union(v.literal(...))` (ICS-78).
 *
 * ICS-78 añade: auditoría de interacciones (`outcome`, `source`, edición y
 * soft-delete), cierre trazable de seguimientos (`resolution`, `completedAt`,
 * ...), `followUps.ownerId` (espejo de `prospects.ownerId`) y la tabla
 * `timelineEvents` como fuente cronológica única de la ficha.
 */

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role,
  }).index("by_email", ["email"]),

  prospects: defineTable({
    name: v.string(),
    phone: v.string(),
    channel,
    interest: v.string(),
    note: v.string(),
    stage,
    stageChangedAt: v.number(),
    lossReason: v.optional(lossReason),
    ownerId: v.id("users"),
  })
    .index("by_stage", ["stage"])
    .index("by_owner", ["ownerId"]),

  interactions: defineTable({
    prospectId: v.id("prospects"),
    at: v.number(),
    type: contactType,
    note: v.string(),
    registeredBy: v.id("users"),
    // ICS-78 — todos opcionales: filas anteriores se leen sin migración.
    outcome: v.optional(outcome),
    // Origen: `manual` (persona), `follow-up` (generada por followUps.complete),
    // `sistema`. Ausente = `manual`. `cumplimientoNota` (ICS-87) solo cuenta manual/ausente.
    source: v.optional(interactionSource),
    editedAt: v.optional(v.number()),
    editedBy: v.optional(v.id("users")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
    // El seguimiento que esta interacción cierra, si aplica.
    followUpId: v.optional(v.id("followUps")),
    // El seguimiento programado como resultado de esta interacción.
    nextFollowUpId: v.optional(v.id("followUps")),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_prospect_and_at", ["prospectId", "at"])
    .index("by_registeredBy", ["registeredBy", "at"])
    .index("by_at", ["at"]),

  followUps: defineTable({
    prospectId: v.id("prospects"),
    at: v.number(),
    type: followUpType,
    status: v.union(v.literal("pendiente"), v.literal("completado")),
    // ICS-78 — cierre trazable.
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.id("users")),
    resolution: v.optional(resolution),
    completedByInteractionId: v.optional(v.id("interactions")),
    closureReason: v.optional(v.string()),
    // Vendedor dueño del seguimiento — espejo de prospects.ownerId. Backfill en ICS-78.
    ownerId: v.optional(v.id("users")),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_status_and_date", ["status", "at"])
    .index("by_owner_status_and_date", ["ownerId", "status", "at"]),

  // ICS-99 — oportunidad de venta: pipeline comercial real, independiente de
  // `prospects.stage` (ciclo de la relación, ICS-98 B2). Un prospecto puede
  // tener 0..N oportunidades, incluso simultáneas.
  opportunities: defineTable({
    prospectId: v.id("prospects"),
    // Dueño comercial. Mientras la oportunidad está abierta, sigue al dueño
    // del prospecto (syncOpenOpportunitiesOwner); al cerrarse queda congelado.
    ownerId: v.id("users"),
    name: v.string(),
    product: v.string(),
    // Ausente (no 0) = "monto pendiente" — excluida de pipeline/forecast hasta
    // completarse. `create`/`update` sí exigen > 0 (ICS-98 B1).
    estimatedAmount: v.optional(v.number()),
    stage: opportunityStage,
    expectedCloseDate: v.optional(v.string()), // "YYYY-MM-DD", puede ser futura
    lossReason: v.optional(lossReason),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("users")),
    saleId: v.optional(v.id("sales")),
    editedAt: v.optional(v.number()),
    editedBy: v.optional(v.id("users")),
    // "manual" (creada por un vendedor) | "migration" (backfill de datos
    // legacy). `migrationKey` hace la migración idempotente (ICS-98 B9).
    source: v.optional(v.union(v.literal("manual"), v.literal("migration"))),
    migrationKey: v.optional(v.string()),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_prospect_and_stage", ["prospectId", "stage"])
    .index("by_owner_and_stage", ["ownerId", "stage"])
    .index("by_owner_and_expected", ["ownerId", "expectedCloseDate"])
    .index("by_stage_and_expected", ["stage", "expectedCloseDate"])
    .index("by_migration_key", ["migrationKey"]),

  sales: defineTable({
    prospectId: v.id("prospects"),
    amount: v.number(),
    product: v.string(),
    closedAt: v.number(),
    closedBy: v.id("users"),
    // ICS-99 — histórico e inmutable: ya no depende de `stage === "ganado"`.
    opportunityId: v.optional(v.id("opportunities")), // ausente = venta directa
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    voidReason: v.optional(v.string()),
    // Vendedor acreditado al cierre — nunca cambia por reasignaciones
    // posteriores del prospecto (a diferencia de `opportunities.ownerId`).
    ownerId: v.optional(v.id("users")),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_closedBy", ["closedBy", "closedAt"])
    .index("by_owner_and_closedAt", ["ownerId", "closedAt"])
    .index("by_closedAt", ["closedAt"])
    .index("by_prospect_and_closedAt", ["prospectId", "closedAt"])
    .index("by_opportunity", ["opportunityId"]),

  // ICS-78 — línea de tiempo de la relación (ficha). Append-only: la escritura
  // desde las mutations y la query `timeline.listByProspect` viven en ICS-85.
  timelineEvents: defineTable({
    prospectId: v.id("prospects"),
    at: v.number(),
    type: timelineEventType,
    actorId: v.optional(v.id("users")),
    interactionId: v.optional(v.id("interactions")),
    followUpId: v.optional(v.id("followUps")),
    saleId: v.optional(v.id("sales")),
    fromStage: v.optional(stage),
    toStage: v.optional(stage),
    // ICS-99 — requerido por "oportunidad-ganada"/"oportunidad-perdida".
    opportunityId: v.optional(v.id("opportunities")),
  }).index("by_prospect_and_at", ["prospectId", "at"]),
});
