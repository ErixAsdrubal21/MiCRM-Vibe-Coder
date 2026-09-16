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
  // ICS-106 — los 3 eventos nuevos (oportunidad-ganada/perdida, venta-anulada)
  // en el cliente que mejor los ilustra: ganó dos veces, y una de esas ventas
  // se anuló después (B3: la oportunidad o5 sigue "ganada").
  p5: [
    { id: 't10', type: 'venta-anulada', at: '11 sept · 09:15', actorName: 'Marta', amount: 4200, product: 'Insumos de oficina', voidReason: 'Monto registrado por error.' },
    { id: 't11', type: 'venta', at: '8 sept · 14:00', actorName: 'Carlos', amount: 4200, product: 'Insumos de oficina' },
    { id: 't12', type: 'oportunidad-ganada', at: '8 sept · 14:00', actorName: 'Carlos', opportunityName: 'Papelería de oficina' },
    { id: 't13', type: 'venta', at: '10 sept · 11:30', actorName: 'Carlos', amount: 12500, product: 'Mobiliario escolar' },
    { id: 't14', type: 'oportunidad-ganada', at: '10 sept · 11:30', actorName: 'Carlos', opportunityName: 'Mobiliario escolar' },
  ],
  p6: [
    { id: 't15', type: 'oportunidad-perdida', at: '5 sept · 16:00', actorName: 'Carlos', opportunityName: 'Equipo de oficina', lossReason: 'Precio' },
  ],
  p1: [
    { id: 't1', type: 'interaccion', at: 'Hoy · 10:20', actorName: 'Carlos', contactType: 'whatsapp', note: 'Le gustó el precio, pidió una semana para decidir.', outcome: 'positivo', mine: true },
    { id: 't2', type: 'cierre-seguimiento', at: 'Ayer · 09:05', actorName: 'Carlos', resolution: 'reprogramado', note: 'Pidió que le marcara la siguiente semana.' },
    { id: 't3', type: 'cambio-etapa', at: '3 sept · 16:40', actorName: 'Carlos', fromStage: 'contactado', toStage: 'negociacion' },
    { id: 't4', type: 'interaccion', at: '3 sept · 16:38', actorName: 'Carlos', contactType: 'llamada', note: 'Primer contacto, muy interesado en tinacos de 1100L para su bodega.', outcome: 'positivo', mine: true },
    { id: 't5', type: 'venta', at: '18 ago · 12:00', actorName: 'Carlos', amount: 4200, product: 'Tinaco 750L' },
  ],
};

// ICS-99..107 — oportunidades de venta, entidad propia (pipeline comercial
// real), distinta de prospect.stage (ciclo de la relación). Ligadas a
// MOCK_PROSPECTS por prospectId. La #4 (o4) está ganada pero su venta fue
// anulada (s2) — B3: la oportunidad sigue "ganada".
window.MOCK_OPPORTUNITIES = [
  { id: 'o1', prospectId: 'p1', prospectName: 'Ferretería El Tornillo', name: 'Cotización tinacos', product: 'Tinaco 1100L', estimatedAmount: 8500, stage: 'negociacion', expectedCloseDate: '2026-09-20' },
  { id: 'o2', prospectId: 'p2', prospectName: 'Abarrotes Doña Lupe', name: 'Anaqueles metálicos', product: 'Anaqueles (x6)', stage: 'cotizacion' }, // sin estimatedAmount -> "Monto pendiente"
  { id: 'o3', prospectId: 'p3', prospectName: 'Taller Mecánico Ríos', name: 'Mantenimiento mensual', product: 'Servicio mensual', estimatedAmount: 3200, stage: 'calificacion' },
  { id: 'o4', prospectId: 'p5', prospectName: 'Papelería Central', name: 'Mobiliario escolar', product: 'Mobiliario escolar', estimatedAmount: 12500, stage: 'ganada', saleId: 's1' },
  { id: 'o5', prospectId: 'p5', prospectName: 'Papelería Central', name: 'Papelería de oficina', product: 'Insumos de oficina', estimatedAmount: 4200, stage: 'ganada', saleId: 's2', voided: true },
  { id: 'o6', prospectId: 'p6', prospectName: 'Consultorio Dr. Medina', name: 'Equipo de oficina', product: 'Escritorios (x3)', estimatedAmount: 9000, stage: 'perdida', lossReason: 'precio' },
];

// Histórico de ventas — inmutable, nunca se borra. s2 está anulada (B3: su
// oportunidad de origen o5 sigue "ganada", el chip "Venta anulada" es lo
// único que cambia).
window.MOCK_SALES = [
  { id: 's1', prospectId: 'p5', prospectName: 'Papelería Central', amount: 12500, product: 'Mobiliario escolar', closedAt: '2026-09-10', opportunityId: 'o4' },
  { id: 's2', prospectId: 'p5', prospectName: 'Papelería Central', amount: 4200, product: 'Insumos de oficina', closedAt: '2026-09-08', opportunityId: 'o5', voidedAt: '2026-09-11', voidReason: 'Monto registrado por error.' },
  { id: 's3', prospectId: 'p1', prospectName: 'Ferretería El Tornillo', amount: 4200, product: 'Tinaco 750L', closedAt: '2026-08-18' }, // venta directa, sin oportunidad
];

window.MOCK_OPORTUNIDADES_METRICS = {
  pipelineValue: 11700, // o1 + o3 (o2 sin monto, excluida)
  forecast: 3230, // o1*0.60 + o3*0.10
  pendingCount: 1,
  conversionThisMonth: 67, // 2 ganadas / (2 ganadas + 1 perdida)
  avgTicketThisMonth: 8350, // (12500 + 4200) / 2, s2 anulada excluida
  funnel: [
    { stage: 'calificacion', count: 1 },
    { stage: 'cotizacion', count: 1 },
    { stage: 'negociacion', count: 1 },
    { stage: 'ganada', count: 2 },
    { stage: 'perdida', count: 1 },
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
