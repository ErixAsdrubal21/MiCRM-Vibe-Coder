// Pantalla 2 — Tareas del día (inicio de Carlos). Recreación de
// src/app/(app)/tareas/page.js. "Nueva tarea" (ICS-92) es posterior al PRD
// original — el botón "+" queda visual, sin pantalla propia en este kit.
const CONTACT_ICON = { llamada: 'phone', whatsapp: 'message-circle', visita: 'map-pin', email: 'mail', otro: 'circle' };
const CONTACT_LABEL = { llamada: 'Llamada', whatsapp: 'WhatsApp', visita: 'Visita', email: 'Email', otro: 'Otro' };

function Tareas({ onOpenProspect }) {
  const { Badge, Tag, IconButton, Icon } = window.MiNegocioCRM;
  const [done, setDone] = React.useState({});
  const todos = window.MOCK_PROSPECTS.filter((p) => p.nextFollowUpType || p.daysSinceContact > 3);
  const pendientes = todos.filter((p) => !done[p.id]).length;
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <div className="top-bar">
        <div>
          <p className="top-bar__title">Hola, Carlos</p>
          <p className="top-bar__sub">{today} · {pendientes} pendiente{pendientes === 1 ? '' : 's'} hoy</p>
        </div>
        <IconButton icon="plus" label="Nueva tarea" />
      </div>

      {todos.map((p) => {
        const atRisk = p.daysSinceContact > 3;
        return (
          <div className="list-row" key={p.id} style={{ cursor: 'pointer', opacity: done[p.id] ? 0.5 : 1 }} onClick={() => onOpenProspect(p.id)}>
            <div>
              <p className="list-row__title">{p.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {atRisk ? (
                  <Tag variant="risk" icon="alert-triangle">{`Sin contacto hace ${p.daysSinceContact} días`}</Tag>
                ) : (
                  <span className="list-row__meta">Contactar hoy</span>
                )}
                {p.nextFollowUpType && (
                  <span className="list-row__meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Icon name={CONTACT_ICON[p.nextFollowUpType]} size={12} />
                    {CONTACT_LABEL[p.nextFollowUpType]}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge stage={p.stage} />
              {p.nextFollowUpType && (
                <IconButton icon="check" label="Marcar como realizada"
                  onClick={(e) => { e.stopPropagation(); setDone((d) => ({ ...d, [p.id]: true })); }} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
window.Tareas = Tareas;
