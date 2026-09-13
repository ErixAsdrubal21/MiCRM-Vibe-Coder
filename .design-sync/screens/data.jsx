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

window.MOCK_DASHBOARD = {
  activeCount: 18,
  salesThisWeek: 3,
  salesThisMonth: 9,
  conversionThisMonth: 34,
  atRiskCount: 2,
  tasksToday: { completadas: 3, total: 5 },
  carlos: { name: 'Carlos', conversionThisWeek: 41 },
};

// Línea de tiempo de la Ficha — solo para 'p1' (Ferretería El Tornillo), los
// 4 tipos de evento de ICS-85/86 mezclados en un solo hilo cronológico.
window.MOCK_TIMELINE = {
  p1: [
    { id: 't1', type: 'interaccion', at: 'Hoy · 10:20', actorName: 'Carlos', contactType: 'whatsapp', note: 'Le gustó el precio, pidió una semana para decidir.', outcome: 'positivo', mine: true },
    { id: 't2', type: 'cierre-seguimiento', at: 'Ayer · 09:05', actorName: 'Carlos', resolution: 'reprogramado', note: 'Pidió que le marcara la siguiente semana.' },
    { id: 't3', type: 'cambio-etapa', at: '3 sept · 16:40', actorName: 'Carlos', fromStage: 'contactado', toStage: 'negociacion' },
    { id: 't4', type: 'interaccion', at: '3 sept · 16:38', actorName: 'Carlos', contactType: 'llamada', note: 'Primer contacto, muy interesado en tinacos de 1100L para su bodega.', outcome: 'positivo', mine: true },
    { id: 't5', type: 'venta', at: '18 ago · 12:00', actorName: 'Carlos', amount: 4200, product: 'Tinaco 750L' },
  ],
};

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
