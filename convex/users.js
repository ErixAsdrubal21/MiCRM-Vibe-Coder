import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Login mock — igual que `mi-crm` (mockAuth.js): no valida contraseña,
 * "detecta" el rol a partir del correo. La diferencia es que aquí el
 * usuario sí queda persistido en Convex (tabla `users`), listo para que
 * `ownerId` en `prospects` apunte a un usuario real cuando se porten esas
 * pantallas. Login real (ICS-6/7/8) sigue en Backlog.
 */

const DEMO_USERS = {
  administrador: { name: "Marta", email: "marta@minegocio.com" },
  vendedor: { name: "Carlos", email: "carlos@minegocio.com" },
};

function roleFromEmail(email) {
  return email.toLowerCase().includes("marta") ? "administrador" : "vendedor";
}

export const loginMock = mutation({
  args: { email: v.optional(v.string()), provider: v.union(v.literal("password"), v.literal("google")) },
  handler: async (ctx, { email, provider }) => {
    const role = roleFromEmail(email || "");
    const demo = DEMO_USERS[role];
    const resolvedEmail = email || demo.email;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", resolvedEmail))
      .unique();

    if (existing) return existing;

    const _id = await ctx.db.insert("users", {
      name: demo.name,
      email: resolvedEmail,
      role,
      authProvider: provider,
    });
    return ctx.db.get(_id);
  },
});
