import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Solo para smoke tests / limpieza manual — `internalMutation`, nunca expuesta
 * a la app. Borra un prospecto y TODO lo que cuelga de él (interacciones,
 * seguimientos, ventas, eventos de línea de tiempo). Correr con el deploy key:
 *   npx convex run testHelpers:deleteProspectCascade '{"id":"<prospectId>"}'
 */
export const deleteProspectCascade = internalMutation({
  args: { id: v.id("prospects") },
  handler: async (ctx, { id }) => {
    const tables = /** @type {const} */ ([
      ["interactions", "by_prospect"],
      ["followUps", "by_prospect"],
      ["sales", "by_prospect"],
      ["timelineEvents", "by_prospect_and_at"],
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
    const prospect = await ctx.db.get(id);
    if (prospect) {
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted };
  },
});
