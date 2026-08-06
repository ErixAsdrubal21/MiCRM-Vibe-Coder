"use client";

/**
 * PeriodToggle — nuevo, Milestone 5. Pill de Semana/Mes, compartido por Mi
 * desempeño, Dashboard (indirectamente vía Reportes) y Reportes — el mismo
 * patrón visual del mockup confirmado (10-mi-desempeno, 09-reportes).
 */
export function PeriodToggle({ value, onChange }) {
  return (
    <div className="mn-period-toggle">
      <button type="button" className={value === "semana" ? "active" : ""} onClick={() => onChange("semana")}>
        Semana
      </button>
      <button type="button" className={value === "mes" ? "active" : ""} onClick={() => onChange("mes")}>
        Mes
      </button>
    </div>
  );
}
