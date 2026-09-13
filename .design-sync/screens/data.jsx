// Datos de ejemplo compartidos por las 8 pantallas — ficticios, con el mismo
// sabor de negocio que usa el resto del sistema (ferretería, abarrotes,
// taller, etc.). No hay backend: es un estado en memoria para el click-through.
window.MOCK_PROSPECTS = [
  { id: 'p1', name: 'Ferretería El Tornillo', interest: 'Tinacos 1100L', phone: '55 1234 5678', channel: 'whatsapp', stage: 'negociacion', daysSinceContact: 1, nextFollowUpType: 'whatsapp' },
  { id: 'p2', name: 'Abarrotes Doña Lupe', interest: 'Anaqueles metálicos', phone: '55 2345 6789', channel: 'referido', stage: 'cotizacion', daysSinceContact: 5, nextFollowUpType: 'llamada' },
  { id: 'p3', name: 'Taller Mecánico Ríos', interest: 'Servicio de mantenimiento mensual', phone: '55 3456 7890', channel: 'visita', stage: 'contactado', daysSinceContact: 0, nextFollowUpType: 'visita' },
  { id: 'p4', name: 'Estética Bella Rosa', interest: 'Productos de belleza al mayoreo', phone: '55 4567 8901', channel: 'redes', stage: 'nuevo', daysSinceContact: 0 },
  { id: 'p5', name: 'Papelería Central', interest: 'Mobiliario escolar', phone: '55 5678 9012', channel: 'whatsapp', stage: 'ganado', daysSinceContact: 2, sale: { amount: 12500, product: 'Mobiliario escolar' } },
  { id: 'p6', name: 'Consultorio Dr. Medina', interest: 'Equipo de oficina', phone: '55 6789 0123', channel: 'otro', stage: 'perdido', lossReason: 'precio' },
];

window.MOCK_REPORTES = {
  ventas: {
    nuevos: 14,
    cerradas: 5,
    valorTotal: 58400,
    conversion: 36,
    detalle: [
      { key: 's1', name: 'Papelería Central', amount: 12500, product: 'Mobiliario escolar' },
      { key: 's2', name: 'Ferretería 3 Hermanos', amount: 8200, product: 'Tinacos 750L (x2)' },
      { key: 's3', name: 'Cocina Económica Meli', amount: 15600, product: 'Equipo de cocina' },
    ],
  },
  perdidas: {
    total: 4,
    porMotivo: [
      { reason: 'precio', label: 'Precio', count: 2 },
      { reason: 'competencia', label: 'Competencia', count: 1 },
      { reason: 'sin-respuesta', label: 'Sin respuesta', count: 1 },
    ],
    detalle: [
      { key: 'l1', name: 'Consultorio Dr. Medina', reasonLabel: 'Precio' },
      { key: 'l2', name: 'Refaccionaria Aguilar', reasonLabel: 'Competencia' },
    ],
  },
};
