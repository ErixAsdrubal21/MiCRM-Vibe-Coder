import React from 'react';
import { KpiTile } from 'mi-crm-next';

/** Los 6 bloques del dashboard ejecutivo de Marta (PRD Pantalla 3) — sin gráficas, solo números claros. */
export function DashboardDeMarta() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: 300 }}>
      <KpiTile value="18" label="Prospectos activos" />
      <KpiTile value="$42,300" label="Ventas esta semana" />
      <KpiTile value="34%" label="Tasa de conversión" />
      <KpiTile value="3" label="Sin seguimiento" warn />
    </div>
  );
}

/** Estado de alerta — cuando el número exige atención (prospectos sin seguimiento > 0). */
export function EstadoDeAlerta() {
  return (
    <div style={{ width: 160 }}>
      <KpiTile value="5" label="Sin seguimiento" warn />
    </div>
  );
}
