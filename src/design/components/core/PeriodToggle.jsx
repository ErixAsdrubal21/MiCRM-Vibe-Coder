"use client";

const DEFAULT_OPTIONS = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

/**
 * PeriodToggle — nuevo, Milestone 5. Pill de dos (o más) opciones
 * conmutables, compartido por Mi desempeño, Dashboard (indirectamente vía
 * Reportes) y Reportes — el mismo patrón visual del mockup confirmado
 * (10-mi-desempeno, 09-reportes). Por defecto Semana/Mes; `options`
 * generaliza el mismo componente a otros pares (ICS-102/103: "Oportunidades"
 * / "Ventas" en `/ventas`) sin duplicar el marcado ni el CSS.
 */
export function PeriodToggle({ value, onChange, options = DEFAULT_OPTIONS }) {
  return (
    <div className="mn-period-toggle">
      {options.map((opt) => (
        <button key={opt.value} type="button" className={value === opt.value ? "active" : ""} onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
