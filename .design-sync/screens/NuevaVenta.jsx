// Pantalla nueva — /ventas/nueva-venta. Recreación de
// src/app/(app)/ventas/nueva-venta/page.js (ICS-103) — venta directa, sin
// oportunidad previa (sales.createDirect).
function NuevaVenta({ onClose, onSaved }) {
  const { Icon, IconButton, Button, Badge } = window.MiNegocioCRM;
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const candidates = window.MOCK_PROSPECTS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={onClose} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Registrar venta directa</p>
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
            <label className="field-label" htmlFor="nv-monto">Monto</label>
            <label className="mn-input mn-input--field">
              <input id="nv-monto" type="number" min="0" step="0.01" placeholder="0.00"
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="nv-producto">Producto o servicio</label>
            <label className="mn-input mn-input--field">
              <input id="nv-producto" type="text" defaultValue={selected.interest}
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="nv-fecha">Fecha de cierre</label>
            <label className="mn-input mn-input--field">
              <input id="nv-fecha" type="date" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
            </label>
          </div>
          <Button type="submit" variant="primary" full>Registrar venta</Button>
        </form>
      )}
    </>
  );
}
window.NuevaVenta = NuevaVenta;
