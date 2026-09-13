import React from 'react';
import { Badge } from 'mi-crm-next';

/** Las 6 etapas fijas y exclusivas del pipeline (PRD) — texto/ícono a color sobre fondo tint, nunca sólido. */
export function TodasLasEtapas() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Badge stage="nuevo" />
      <Badge stage="contactado" />
      <Badge stage="cotizacion" />
      <Badge stage="negociacion" />
      <Badge stage="ganado" />
      <Badge stage="perdido" />
    </div>
  );
}

/** Uso real: encabezado de la ficha del cliente, junto al nombre. */
export function EnFichaDeCliente() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Ferretería El Tornillo</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-mute)' }}>Interesado en tinacos 1100L</p>
      </div>
      <Badge stage="negociacion" />
    </div>
  );
}
