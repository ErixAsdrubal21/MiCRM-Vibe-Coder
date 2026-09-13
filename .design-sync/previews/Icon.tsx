import React from 'react';
import { Icon } from 'mi-crm-next';

const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-mute)', fontFamily: 'var(--font-ui)' };

/** Set outline de Lucide usado en la app — llamada, WhatsApp, visita, email, y los de estado. */
export function IconosDeContacto() {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={cell}><Icon name="phone" size={24} />llamada</div>
      <div style={cell}><Icon name="message-circle" size={24} />whatsapp</div>
      <div style={cell}><Icon name="map-pin" size={24} />visita</div>
      <div style={cell}><Icon name="mail" size={24} />email</div>
    </div>
  );
}

/** Íconos de estado/acción — alerta de riesgo, venta, cierre, seguimiento. */
export function IconosDeEstado() {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={cell}><Icon name="alert-triangle" size={24} />riesgo</div>
      <div style={cell}><Icon name="dollar-sign" size={24} />venta</div>
      <div style={cell}><Icon name="check-circle" size={24} />cierre</div>
      <div style={cell}><Icon name="calendar-clock" size={24} />seguimiento</div>
    </div>
  );
}

/** Tamaños — 16/18/24px son los que usa la app (badge/meta, input, encabezado). */
export function Tamanos() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Icon name="search" size={16} />
      <Icon name="search" size={18} />
      <Icon name="search" size={24} />
    </div>
  );
}
