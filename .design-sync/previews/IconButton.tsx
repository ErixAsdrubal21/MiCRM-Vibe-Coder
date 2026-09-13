import React from 'react';
import { IconButton } from 'mi-crm-next';

/** Botón cuadrado 40×40 solo-ícono — sólido (nav/acciones primarias) vs. outline (top bars). */
export function SolidoVsOutline() {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <IconButton icon="pencil" label="Editar" />
      <IconButton icon="arrow-left" outline label="Volver" />
    </div>
  );
}

/** Uso real: encabezado de la ficha del cliente (volver + editar) y acciones inline (editar/borrar interacción). */
export function EnBarraSuperior() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 260 }}>
      <IconButton icon="arrow-left" outline label="Volver" />
      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Ficha del prospecto</p>
      <IconButton icon="pencil" label="Editar" />
    </div>
  );
}
