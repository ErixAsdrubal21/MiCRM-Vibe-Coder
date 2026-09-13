import React from 'react';
import { Input } from 'mi-crm-next';

/** `variant="search"` (default) — pill, fondo surface-sunken, ícono a la izquierda. Usado en Prospectos y /actividad. */
export function Buscador() {
  return (
    <div style={{ width: 280 }}>
      <Input variant="search" placeholder="Buscar por nombre o teléfono" />
    </div>
  );
}

/** `variant="field"` — radio sm, fondo surface + borde hairline. Usado en formularios (nuevo prospecto, editar ficha). */
export function CampoDeFormulario() {
  return (
    <div style={{ width: 280 }}>
      <Input variant="field" placeholder="tu@negocio.com" />
    </div>
  );
}
