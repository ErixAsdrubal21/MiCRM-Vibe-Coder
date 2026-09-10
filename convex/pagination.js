/**
 * ICS-81 — helpers de paginación e hidratación compartidos por los feeds de
 * `/actividad` (`interactions.feed`, `followUps.list`) y por `timeline.js`.
 */

/**
 * Paginación con filtro secundario en JS SIN devolver páginas vacías.
 *
 * Convex `.paginate()` corta por número de filas leídas del índice, no por
 * filas que pasan un predicado. Para filtros como `type`/`outcome` —que no
 * están en el índice base— esto haría que una página "de 25" devuelva 0
 * resultados aunque haya coincidencias más adelante. Aquí seguimos leyendo
 * lotes internos del índice hasta juntar al menos `numItems` que pasan el
 * predicado, agotar el índice, o alcanzar `maxBatches` (tope de seguridad).
 *
 * El cursor devuelto SIEMPRE cae en un límite de lote real del índice, así
 * que no hay huecos ni duplicados entre páginas. La página devuelta puede
 * superar `numItems` (se aceptan lotes completos); el cliente lo tolera.
 *
 * @param makeQuery  `() => OrderedQuery` — se reconstruye por lote porque
 *                    `.paginate()` es terminal.
 * @param predicate  `(doc) => boolean` — filtro secundario.
 */
export async function collectFilteredPage(makeQuery, { numItems, cursor }, predicate, { maxBatches = 25 } = {}) {
  const batchSize = Math.max(numItems, 25);
  const page = [];
  let nextCursor = cursor ?? null;
  let isDone = false;
  let batches = 0;

  while (page.length < numItems && batches < maxBatches) {
    const res = await makeQuery().paginate({ numItems: batchSize, cursor: nextCursor });
    batches++;
    for (const doc of res.page) {
      if (predicate(doc)) page.push(doc);
    }
    nextCursor = res.continueCursor;
    if (res.isDone) {
      isDone = true;
      break;
    }
  }

  return { page, isDone, continueCursor: nextCursor };
}

/**
 * Lee cada id de `ids` UNA sola vez (Convex no tiene joins); devuelve
 * `Map<id, doc>` sin los que no existen. O(tamaño de página) lecturas.
 */
export async function hydrateByIds(ctx, ids) {
  const map = new Map();
  await Promise.all(
    [...ids].map(async (id) => {
      const doc = await ctx.db.get(id);
      if (doc) map.set(id, doc);
    }),
  );
  return map;
}
