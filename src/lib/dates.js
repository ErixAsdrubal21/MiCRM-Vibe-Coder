/**
 * Fechas calendario en horario LOCAL — helpers puros, sin dependencias.
 *
 * Un `<input type="date">` da/recibe strings "YYYY-MM-DD". El bug a evitar:
 * `new Date("2026-09-06")` se interpreta como medianoche UTC, que en México
 * (UTC-6) es la tarde del día anterior; y `toISOString()` convierte a UTC
 * antes de recortar, así que de noche puede saltar de día. Todo el resto del
 * código (relativeFollowUpLabel, isDueTodayOrOverdue, daysSince) razona en
 * horario local, así que aquí también.
 */

/** Un `Date` → "YYYY-MM-DD" usando sus componentes locales (no UTC). */
function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" de hoy en horario local — para `value` / `min` de un input date. */
export function todayISO() {
  return toISODateLocal(new Date());
}

/** "YYYY-MM-DD" de hoy + `n` días, en horario local. */
export function plusDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODateLocal(d);
}

/** "YYYY-MM-DD" → timestamp de la medianoche LOCAL de ese día calendario. */
export function isoToLocalMs(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
