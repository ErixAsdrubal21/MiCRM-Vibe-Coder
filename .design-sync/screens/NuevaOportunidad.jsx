// Pantalla nueva — /ventas/nueva-oportunidad. Recreación de
// src/app/(app)/ventas/nueva-oportunidad/page.js (ICS-103). Mismo patrón de
// selector de cliente que "Nueva tarea"/"Registrar interacción".
const OPP_STAGE_CHIPS = [
  { value: 'calificacion', label: 'Calificación' },
  { value: 'cotizacion', label: 'Cotización' },
  { value: 'negociacion', label: 'Negociación' },
];

function NuevaOportunidad({ onClose, onSaved }) {
  const { Icon, IconButton, Button, Badge } = window.MiNegocioCRM;
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const [stage, setStage] = React.useState('calificacion');
  const candidates = window.MOCK_PROSPECTS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={onClose} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Nueva oportunidad</p>
        </div>
      </div>

      {!selected ? (
        <>
          <div className="search-row">
            <label className="mn-input">
              <Icon name="search" size={18} />
              <input type="text" placeholder="Buscar cliente por nombre" value={query} onChange={(e) => setQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} autoFocus />
            </label>
          </div>
          {candidates.map((p) => (
            <button key={p.id} className="list-row" style={{ border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={() => setSelected(p)}>
              <p className="list-row__title">{p.name}</p>
              <Badge stage={p.stage} />
            </button>
          ))}
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onSaved(); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="next-follow-card">
            <p className="next-follow-card__title">Cliente</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="list-row__title" style={{ margin: 0 }}>{selected.name}</p>
              <button type="button" className="mn-button mn-button--ghost" style={{ height: 32, padding: '0 10px', fontSize: 12.5 }} onClick={() => setSelected(null)}>Cambiar</button>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="no-nombre">Nombre de la oportunidad</label>
            <label className="mn-input mn-input--field">
              <input id="no-nombre" type="text" placeholder="Ej. Cotización tinacos 1100L" defaultValue={`Cotización ${selected.interest}`}
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="no-producto">Producto o servicio</label>
            <label className="mn-input mn-input--field">
              <input id="no-producto" type="text" defaultValue={selected.interest}
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="no-monto">Monto estimado</label>
            <label className="mn-input mn-input--field">
              <input id="no-monto" type="number" min="0" step="0.01" placeholder="0.00"
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <div className="field-group">
            <span className="field-label">Etapa inicial</span>
            <div className="chip-row">
              {OPP_STAGE_CHIPS.map((c) => (
                <button type="button" key={c.value} className={`chip${stage === c.value ? ' selected' : ''}`} onClick={() => setStage(c.value)}>{c.label}</button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="no-fecha">Fecha esperada de cierre (opcional)</label>
            <label className="mn-input mn-input--field">
              <input id="no-fecha" type="date" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <Button type="submit" variant="primary" full>Guardar oportunidad</Button>
        </form>
      )}
    </>
  );
}
window.NuevaOportunidad = NuevaOportunidad;
