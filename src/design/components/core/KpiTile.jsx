"use client";

/**
 * KpiTile — componente NUEVO frente a la versión anterior del sistema.
 * Bloque denso de número + etiqueta para el dashboard de Marta — sin
 * gráfica, tal como pide literalmente la Pantalla 3 del PRD ("seis números
 * grandes en bloques... sin gráficas"). Inspirado en la disciplina de panel
 * modular de Nintendo.com, adaptada sin su piel retro.
 */
export function KpiTile({ value, label, warn = false }) {
  return (
    <div className={`mn-kpi-tile ${warn ? "mn-kpi-tile--warn" : ""}`.trim()}>
      <span className="mn-kpi-tile__num">{value}</span>
      <span className="mn-kpi-tile__label">{label}</span>
    </div>
  );
}