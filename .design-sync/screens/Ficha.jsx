// Pantalla 5 — Ficha del prospecto/cliente. Recreación de
// src/app/(app)/prospectos/[id]/page.js en su versión ICS-86 (línea de
// tiempo unificada + editar/borrar + cerrar/reprogramar) — el diseño
// objetivo, aunque esa rama no esté mergeada todavía.
const CONTACT_ICON = { llamada: 'phone', whatsapp: 'message-circle', visita: 'map-pin', email: 'mail', otro: 'circle' };
const CONTACT_LABEL = { llamada: 'Llamada', whatsapp: 'WhatsApp', visita: 'Visita', email: 'Email', otro: 'Otro' };
const RESOLUTION_LABEL = { hecho: 'Realizado', 'no-contactado': 'Sin contacto', reprogramado: 'Reprogramado', cancelado: 'Cancelado' };
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', referido: 'Referido', redes: 'Redes', visita: 'Visita', otro: 'Otro' };

function TimelineEvent({ event, onAskDelete, confirmingDelete, onConfirmDelete, onCancelDelete }) {
  const { Icon, IconButton, Tag, Button } = window.MiNegocioCRM;

  if (event.type === 'interaccion') {
    return (
      <div className="tl-item">
        <div className="tl-item__icon tl-item__icon--accent"><Icon name={CONTACT_ICON[event.contactType]} size={16} /></div>
        <div className="tl-item__body">
          {confirmingDelete ? (
            <div className="tl-confirm">
              <span>¿Eliminar esta interacción?</span>
              <Button variant="secondary" onClick={onCancelDelete}>No</Button>
              <Button variant="primary" onClick={onConfirmDelete}>Sí, eliminar</Button>
            </div>
          ) : (
            <>
              <div className="tl-item__head">
                <p className="tl-item__title">{CONTACT_LABEL[event.contactType]}</p>
                <span className="tl-item__date">{event.at}</span>
              </div>
              <p className="tl-item__note">{event.note}</p>
              <div className="tl-item__meta">
                <span className="tl-item__author">{event.actorName}</span>
                {event.outcome && <Tag variant="success">Positivo</Tag>}
              </div>
            </>
          )}
        </div>
        {event.mine && !confirmingDelete && (
          <div className="tl-item__actions">
            <IconButton icon="pencil" label="Editar interacción" />
            <IconButton icon="trash-2" label="Eliminar interacción" onClick={onAskDelete} />
          </div>
        )}
      </div>
    );
  }

  if (event.type === 'cambio-etapa') {
    return (
      <div className="tl-item tl-item--muted">
        <div className="tl-item__icon"><Icon name="arrow-right" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">De {STAGE_LABEL[event.fromStage]} a {STAGE_LABEL[event.toStage]}</p>
            <span className="tl-item__date">{event.at}</span>
          </div>
          <div className="tl-item__meta"><span className="tl-item__author">{event.actorName}</span></div>
        </div>
      </div>
    );
  }

  if (event.type === 'cierre-seguimiento') {
    return (
      <div className="tl-item tl-item--muted">
        <div className="tl-item__icon"><Icon name="check-circle" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">Seguimiento cerrado: {RESOLUTION_LABEL[event.resolution]}</p>
            <span className="tl-item__date">{event.at}</span>
          </div>
          {event.note && <p className="tl-item__note">{event.note}</p>}
          <div className="tl-item__meta">
            <span className="tl-item__author">{event.actorName}</span>
            <Tag variant="neutral">{RESOLUTION_LABEL[event.resolution]}</Tag>
          </div>
        </div>
      </div>
    );
  }

  if (event.type === 'venta') {
    return (
      <div className="tl-item">
        <div className="tl-item__icon tl-item__icon--accent"><Icon name="dollar-sign" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">Venta registrada: ${event.amount.toLocaleString('es-MX')} · {event.product}</p>
            <span className="tl-item__date">{event.at}</span>
          </div>
          <div className="tl-item__meta"><span className="tl-item__author">{event.actorName}</span></div>
        </div>
      </div>
    );
  }

  // ICS-106 — 3 tipos nuevos (ICS-99/101).
  if (event.type === 'oportunidad-ganada') {
    return (
      <div className="tl-item">
        <div className="tl-item__icon tl-item__icon--accent"><Icon name="trophy" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">Oportunidad ganada: {event.opportunityName}</p>
            <span className="tl-item__date">{event.at}</span>
          </div>
          <div className="tl-item__meta"><span className="tl-item__author">{event.actorName}</span></div>
        </div>
      </div>
    );
  }

  if (event.type === 'oportunidad-perdida') {
    return (
      <div className="tl-item tl-item--muted">
        <div className="tl-item__icon"><Icon name="x-circle" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">Oportunidad perdida: {event.opportunityName}</p>
            <span className="tl-item__date">{event.at}</span>
          </div>
          <div className="tl-item__meta">
            <span className="tl-item__author">{event.actorName}</span>
            {event.lossReason && <Tag variant="neutral">{event.lossReason}</Tag>}
          </div>
        </div>
      </div>
    );
  }

  if (event.type === 'venta-anulada') {
    return (
      <div className="tl-item tl-item--muted">
        <div className="tl-item__icon"><Icon name="ban" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">Venta anulada: ${event.amount.toLocaleString('es-MX')} · {event.product}</p>
            <span className="tl-item__date">{event.at}</span>
          </div>
          {event.voidReason && <p className="tl-item__note">{event.voidReason}</p>}
          <div className="tl-item__meta"><span className="tl-item__author">{event.actorName}</span></div>
        </div>
      </div>
    );
  }
  return null;
}
const STAGE_LABEL = { nuevo: 'Nuevo', contactado: 'Contactado', cotizacion: 'Cotización enviada', negociacion: 'En negociación', ganado: 'Ganado', perdido: 'Perdido' };
function money(n) { return `$${n.toLocaleString('es-MX')}`; }

function Ficha({ role, prospectId, onBack, onRegistrarInteraccion, onNuevaOportunidad, onNuevaVenta, onVerVenta }) {
  const { Icon, IconButton, Badge, Tag, Button } = window.MiNegocioCRM;
  const canEdit = role === 'vendedor';
  const prospect = window.MOCK_PROSPECTS.find((p) => p.id === prospectId) || window.MOCK_PROSPECTS[0];
  const timeline = window.MOCK_TIMELINE[prospect.id] || [];
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);

  // ICS-104 — oportunidades/ventas de este cliente. Join en lectura para
  // "venta anulada" (B3: opportunity.saleId -> sale.voidedAt, sin campo nuevo).
  const opportunities = window.MOCK_OPPORTUNITIES.filter((o) => o.prospectId === prospect.id);
  const sales = window.MOCK_SALES.filter((s) => s.prospectId === prospect.id);
  const saleById = Object.fromEntries(sales.map((s) => [s.id, s]));
  const openOpportunities = opportunities.filter((o) => ['calificacion', 'cotizacion', 'negociacion'].includes(o.stage));
  const pipelineAmount = openOpportunities.reduce((sum, o) => sum + (o.estimatedAmount || 0), 0);
  const activeSales = sales.filter((s) => !s.voidedAt);
  const salesTotal = activeSales.reduce((sum, s) => sum + s.amount, 0);

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="arrow-left" outline label="Volver" onClick={onBack} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Ficha del prospecto</p>
        </div>
        {canEdit && <IconButton icon="pencil" label="Editar" />}
      </div>

      <div className="id-card">
        <div className="id-card__head">
          <div>
            <p className="id-card__name">{prospect.name}</p>
            <p className="id-card__biz">{prospect.interest}</p>
          </div>
        </div>
        <div className="id-row"><Icon name="phone" size={16} />{prospect.phone}</div>
        <div className="id-row"><Icon name="message-circle" size={16} />Llegó por {CHANNEL_LABEL[prospect.channel]}</div>
      </div>

      <div className="stage-row">
        <div>
          <p className="stage-row__label">Etapa actual</p>
          <Badge stage={prospect.stage} />
        </div>
        {canEdit && <button className="mn-button mn-button--ghost" style={{ height: 36, padding: '0 10px', fontSize: 12.5 }}>Cambiar</button>}
      </div>

      {/* ICS-104: el bloque "Vendido: $X" atado a stage==="ganado" se quitó —
          el detalle de venta vive ahora en el bloque "Ventas" de abajo. */}
      {prospect.nextFollowUpType ? (
        <div className="next-follow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--color-accent-pressed)', display: 'inline-flex' }}><Icon name="calendar-clock" size={18} /></span>
            <span className="next-follow__txt">Próximo seguimiento: <b>mañana · {CONTACT_LABEL[prospect.nextFollowUpType]}</b></span>
          </div>
          {canEdit && (
            <div className="follow-actions">
              <Button variant="secondary">Marcar como hecho</Button>
              <Button variant="secondary">Reprogramar</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="next-follow">
          <span style={{ color: 'var(--color-accent-pressed)', display: 'inline-flex' }}><Icon name="calendar-clock" size={18} /></span>
          <span className="next-follow__txt">Sin seguimiento programado</span>
        </div>
      )}

      {/* ICS-104 — bloques de oportunidades/ventas del cliente. */}
      <p className="section-label">Oportunidades{openOpportunities.length > 0 ? ` · ${money(pipelineAmount)} en pipeline` : ''}</p>
      {canEdit && <Button variant="secondary" onClick={() => onNuevaOportunidad(prospect.id)}>+ Nueva oportunidad</Button>}
      {opportunities.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-mute)' }}>Sin oportunidades registradas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opportunities.map((o) => {
            const isOpen = ['calificacion', 'cotizacion', 'negociacion'].includes(o.stage);
            const voidedSale = o.saleId ? saleById[o.saleId] : null;
            return (
              <div className="list-row" key={o.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <p className="list-row__title">{o.name}</p>
                  <Badge stage={o.stage} />
                </div>
                <p className="list-row__meta">{o.product}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  {o.estimatedAmount != null ? (
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 700, color: 'var(--color-ink)' }}>{money(o.estimatedAmount)}</span>
                  ) : (
                    <Tag variant="neutral">Monto pendiente</Tag>
                  )}
                  {o.stage === 'ganada' && voidedSale?.voidedAt && <Tag variant="risk">Venta anulada</Tag>}
                  {isOpen && o.expectedCloseDate && <span className="list-row__meta">Esperada: {o.expectedCloseDate}</span>}
                </div>
                {canEdit && isOpen && (
                  <div className="follow-actions">
                    <Button variant="secondary">Editar</Button>
                    <Button variant="secondary">Ganar</Button>
                    <Button variant="secondary">Marcar perdida</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="section-label">Ventas{activeSales.length > 0 ? ` · ${money(salesTotal)} en ${activeSales.length} venta${activeSales.length === 1 ? '' : 's'}` : ''}</p>
      {canEdit && <Button variant="secondary" onClick={() => onNuevaVenta(prospect.id)}>+ Registrar venta directa</Button>}
      {sales.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-mute)' }}>Sin ventas registradas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sales.map((s) => (
            <button
              key={s.id}
              className="list-row"
              style={{ border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', opacity: s.voidedAt ? 0.6 : 1 }}
              onClick={() => onVerVenta(s.id)}
            >
              <div>
                <p className="list-row__title">{money(s.amount)} · {s.product}</p>
                <p className="list-row__meta">{s.closedAt}</p>
              </div>
              {s.voidedAt && <Tag variant="risk">Venta anulada</Tag>}
            </button>
          ))}
        </div>
      )}

      <p className="section-label">Historial de la relación</p>
      {timeline.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-mute)' }}>Todavía no hay actividad registrada.</p>
      ) : (
        <div className="timeline">
          {timeline.map((event) => (
            <TimelineEvent key={event.id} event={event}
              confirmingDelete={confirmDeleteId === event.id}
              onAskDelete={() => setConfirmDeleteId(event.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onConfirmDelete={() => setConfirmDeleteId(null)} />
          ))}
        </div>
      )}

      {canEdit && (
        <div className="action-row">
          <Button variant="primary" onClick={() => onRegistrarInteraccion(prospect.id)}>Registrar interacción</Button>
        </div>
      )}
    </>
  );
}
window.Ficha = Ficha;
