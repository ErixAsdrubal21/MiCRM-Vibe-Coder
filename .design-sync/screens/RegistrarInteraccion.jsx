// Pantalla 7 — Registrar interacción. Recreación de
// src/app/(app)/prospectos/[id]/interaccion/page.js.
const CONTACT_TYPES = [
  { value: 'whatsapp', label: 'WhatsApp', icon: 'message-circle' },
  { value: 'llamada', label: 'Llamada', icon: 'phone' },
  { value: 'visita', label: 'Visita', icon: 'map-pin' },
  { value: 'email', label: 'Email', icon: 'mail' },
];
const FOLLOW_UP_TYPES = CONTACT_TYPES.filter((t) => t.value !== 'email');

function RegistrarInteraccion({ prospectId, onClose, onSaved }) {
  const { Icon, IconButton, Button } = window.MiNegocioCRM;
  const prospect = window.MOCK_PROSPECTS.find((p) => p.id === prospectId) || window.MOCK_PROSPECTS[0];
  const [type, setType] = React.useState('whatsapp');
  const [followUpType, setFollowUpType] = React.useState('whatsapp');
  const followUpRequired = prospect.stage !== 'ganado' && prospect.stage !== 'perdido';
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={onClose} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Registrar interacción</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSaved(); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="top-bar__sub" style={{ margin: 0 }}>{prospect.name} · {prospect.interest}</p>

        <div className="field-group">
          <span className="field-label">Tipo de contacto</span>
          <div className="contact-type-row">
            {CONTACT_TYPES.map((t) => (
              <button type="button" key={t.value} className={`contact-type-chip${type === t.value ? ' selected' : ''}`} onClick={() => setType(t.value)}>
                <Icon name={t.icon} size={18} />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="ri-nota">¿Qué pasó?</label>
          <textarea id="ri-nota" className="mn-field-text" placeholder="Ej. Le gustó el precio, pidió una semana para decidir..."
            defaultValue="Le interesó el precio de mayoreo, pidió cotización formal por escrito." />
        </div>

        <div className="next-follow-card">
          <p className="next-follow-card__title">Próximo seguimiento{followUpRequired && ' *'}</p>
          <div className="field-group">
            <label className="mn-input mn-input--field">
              <input type="date" min={tomorrow} defaultValue={tomorrow}
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <div className="contact-type-row">
            {FOLLOW_UP_TYPES.map((t) => (
              <button type="button" key={t.value} className={`contact-type-chip${followUpType === t.value ? ' selected' : ''}`} onClick={() => setFollowUpType(t.value)}>
                <Icon name={t.icon} size={18} />{t.label}
              </button>
            ))}
          </div>
          {followUpRequired && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--color-mute)', margin: 0 }}>
              Todo prospecto activo necesita una fecha de próximo seguimiento.
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" full>Guardar y programar</Button>
      </form>
    </>
  );
}
window.RegistrarInteraccion = RegistrarInteraccion;
