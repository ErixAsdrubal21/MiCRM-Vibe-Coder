import React from 'react';
import { PerfTile } from 'mi-crm-next';

/** "Mi desempeño" de Carlos — número + delta vs. el período anterior, flecha de color por dirección. */
export function LasTresDirecciones() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <PerfTile value="12" label="Prospectos atendidos" delta="+3 vs. semana pasada" direction="up" />
      <PerfTile value="28%" label="Tasa de conversión" delta="-4% vs. semana pasada" direction="down" />
      <PerfTile value="4" label="Ventas cerradas" delta="igual que la semana pasada" direction="flat" />
    </div>
  );
}

/** Sin delta — primer período sin comparación disponible. */
export function SinComparacion() {
  return (
    <div style={{ width: 140 }}>
      <PerfTile value="9" label="Prospectos atendidos" />
    </div>
  );
}
