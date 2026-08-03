import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Modelo de datos del CRM — espejo del esquema mock de `mi-crm` (ICS-5),
 * normalizado para Convex (tablas + referencias por _id en vez de arrays
 * embebidos). Los 6 nombres de etapa y los tipos de contacto se validan
 * con `v.union(v.literal(...))` para que coincidan exactamente con el PRD.
 */

const stage = v.union(
  v.literal("nuevo"),
  v.literal("contactado"),
  v.literal("cotizacion"),
  v.literal("negociacion"),
  v.literal("ganado"),
  v.literal("perdido")
);

const contactType = v.union(
  v.literal("llamada"),
  v.literal("whatsapp"),
  v.literal("visita"),
  v.literal("email")
);

const channel = v.union(
  v.literal("whatsapp"),
  v.literal("referido"),
  v.literal("redes"),
  v.literal("visita"),
  v.literal("otro")
);

const lossReason = v.union(
  v.literal("precio"),
  v.literal("competencia"),
  v.literal("sin-respuesta"),
  v.literal("tiempo"),
  v.literal("otro")
);

const role = v.union(v.literal("administrador"), v.literal("vendedor"));

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role,
    authProvider: v.union(v.literal("password"), v.literal("google")),
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
  })
    .index("by_prospect", ["prospectId"])
    .index("by_registeredBy", ["registeredBy", "at"]),

  followUps: defineTable({
    prospectId: v.id("prospects"),
    at: v.number(),
    type: v.union(v.literal("llamada"), v.literal("whatsapp"), v.literal("visita"), v.literal("otro")),
    status: v.union(v.literal("pendiente"), v.literal("completado")),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_status_and_date", ["status", "at"]),

  sales: defineTable({
    prospectId: v.id("prospects"),
    amount: v.number(),
    product: v.string(),
    closedAt: v.number(),
    closedBy: v.id("users"),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_closedBy", ["closedBy", "closedAt"]),
});
