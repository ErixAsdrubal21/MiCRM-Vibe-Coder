// Pantalla 6 — Nuevo prospecto. Recreación de src/app/(app)/prospectos/nuevo/page.js.
const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referido', label: 'Referido' },
  { value: 'redes', label: 'Redes' },
  { value: 'visita', label: 'Visita' },
  { value: 'otro', label: 'Otro' },
];

function NuevoProspecto({ onClose, onSaved }) {
  const { IconButton, Button } = window.MiNegocioCRM;
  const [channel, setChannel] = React.useState('whatsapp');

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={onClose} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Nuevo prospecto</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSaved(); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="field-group">
          <label className="field-label" htmlFor="np-nombre">Nombre</label>
          <label className="mn-input mn-input--field">
            <input id="np-nombre" type="text" placeholder="Nombre del prospecto" defaultValue="Rosticería La Espiga"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="np-tel">Teléfono</label>
          <label className="mn-input mn-input--field">
            <input id="np-tel" type="tel" placeholder="55 0000 0000" defaultValue="55 7890 1234"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
          </label>
        </div>
        <div className="field-group">
          <span className="field-label">Canal de entrada</span>
          <div className="chip-row">
            {CHANNELS.map((c) => (
              <button type="button" key={c.value} className={`chip${channel === c.value ? ' selected' : ''}`} onClick={() => setChannel(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="np-interes">¿Qué le interesa?</label>
          <label className="mn-input mn-input--field">
            <input id="np-interes" type="text" placeholder="Producto o servicio" defaultValue="Charolas y empaque para eventos"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="np-nota">Nota inicial</label>
          <textarea id="np-nota" className="mn-field-text" placeholder="Contexto breve de la conversación..."
            defaultValue="Preguntó por precio de mayoreo para eventos de fin de año." />
        </div>
        <Button type="submit" variant="primary" full>Guardar prospecto</Button>
      </form>
    </>
  );
}
window.NuevoProspecto = NuevoProspecto;
