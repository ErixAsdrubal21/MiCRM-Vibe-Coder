import React from 'react';
import { Button } from 'mi-crm-next';

/** Las 4 variantes — primary es CTA-only (acento marigold), nunca fuera de una acción principal. */
export function Variantes() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button variant="primary">Guardar</Button>
      <Button variant="secondary">Cancelar</Button>
      <Button variant="ghost">Cambiar</Button>
      <Button variant="danger">Cerrar sesión</Button>
    </div>
  );
}

/** `full` — ancho completo, el patrón de todos los formularios de la app. */
export function AnchoCompleto() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
      <Button variant="primary" full>Registrar interacción</Button>
      <Button variant="secondary" full>Cancelar</Button>
    </div>
  );
}

/** `pill` — radio total, y estado disabled durante un envío. */
export function PillYDeshabilitado() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="primary" pill>Filtrar</Button>
      <Button variant="primary" disabled>Guardando...</Button>
    </div>
  );
}
