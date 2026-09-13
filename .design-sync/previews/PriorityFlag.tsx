import React from 'react';
import { PriorityFlag } from 'mi-crm-next';

/** Las 3 prioridades manuales (mejora post-MVP, "CRM, cambios y mejoras"). Forma deliberadamente distinta de Badge — chip + punto, no pill sólido. */
export function LasTresPrioridades() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <PriorityFlag level="alta" />
      <PriorityFlag level="media" />
      <PriorityFlag level="baja" />
    </div>
  );
}

/** `inline` — versión compacta para meterse junto a otro dato (uso real: dentro de ProspectCard). */
export function EnLinea() {
  return (
    <p style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
      Contactar hoy <PriorityFlag level="alta" inline />
    </p>
  );
}
