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
  return null;
}
const STAGE_LABEL = { nuevo: 'Nuevo', contactado: 'Contactado', cotizacion: 'Cotización enviada', negociacion: 'En negociación', ganado: 'Ganado', perdido: 'Perdido' };

function Ficha({ role, prospectId, onBack, onRegistrarInteraccion }) {
  const { Icon, IconButton, Badge, Button } = window.MiNegocioCRM;
  const canEdit = role === 'vendedor';
  const prospect = window.MOCK_PROSPECTS.find((p) => p.id === prospectId) || window.MOCK_PROSPECTS[0];
  const timeline = window.MOCK_TIMELINE[prospect.id] || [];
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);

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

      {prospect.stage === 'ganado' && prospect.sale ? (
        <div className="next-follow">
          <span style={{ color: 'var(--color-accent-pressed)', display: 'inline-flex' }}><Icon name="dollar-sign" size={18} /></span>
          <span className="next-follow__txt">Vendido: <b>${prospect.sale.amount.toLocaleString('es-MX')} · {prospect.sale.product}</b></span>
        </div>
      ) : prospect.nextFollowUpType ? (
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
