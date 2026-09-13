import React from 'react';
import { Tag } from 'mi-crm-next';

/** Los 3 variantes de metadata — riesgo (rojo), éxito (verde), neutral. Distinto de Badge: Tag es de propósito general. */
export function Variantes() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Tag variant="risk" icon="alert-triangle">Sin contacto hace 4 días</Tag>
      <Tag variant="success" icon="check-circle">Venta confirmada</Tag>
      <Tag variant="neutral">Editada</Tag>
    </div>
  );
}

/** Sin ícono — usado como marca corta (p. ej. "Editada" en el historial de una interacción). */
export function SinIcono() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Tag variant="neutral">Reprogramado</Tag>
      <Tag variant="success">Realizado</Tag>
    </div>
  );
}
