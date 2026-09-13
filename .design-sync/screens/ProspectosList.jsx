// Pantalla 4 — Lista de prospectos y clientes. Recreación de
// src/app/(app)/prospectos/page.js.
const STAGE_LABELS = { nuevo: 'Nuevo', contactado: 'Contactado', cotizacion: 'Cotización', negociacion: 'Negociación', ganado: 'Ganado', perdido: 'Perdido' };
const STAGES = ['nuevo', 'contactado', 'cotizacion', 'negociacion', 'ganado', 'perdido'];

function contactMeta(p) {
  if (p.stage === 'perdido') return `Motivo: ${p.lossReason ?? 'sin especificar'}`;
  if (p.stage === 'ganado') return 'Cerrado hace 2 días';
  if (p.daysSinceContact === 0) return 'Contactar hoy';
  if (p.daysSinceContact > 3) return `Sin contacto hace ${p.daysSinceContact} días`;
  return `Hace ${p.daysSinceContact} día${p.daysSinceContact === 1 ? '' : 's'}`;
}
function isAtRisk(p) {
  return (p.stage !== 'ganado' && p.stage !== 'perdido') && p.daysSinceContact > 3;
}

function ProspectosList({ initialRiskFilter, onOpenProspect }) {
  const { Icon, Badge, Tag } = window.MiNegocioCRM;
  const [query, setQuery] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState(initialRiskFilter ? 'riesgo' : 'todas');

  const filtered = window.MOCK_PROSPECTS.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''));
    const matchesStage = stageFilter === 'todas' || (stageFilter === 'riesgo' ? isAtRisk(p) : p.stage === stageFilter);
    return matchesQuery && matchesStage;
  });

  return (
    <>
      <div className="top-bar"><p className="top-bar__title">Prospectos</p></div>

      <div className="search-row">
        <label className="mn-input">
          <Icon name="search" size={18} />
          <input type="text" placeholder="Buscar por nombre o teléfono" value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
        </label>
      </div>

      <div className="chip-row chip-row--scroll">
        <button className={`chip chip--filter${stageFilter === 'todas' ? ' selected' : ''}`} onClick={() => setStageFilter('todas')}>Todas</button>
        <button className={`chip chip--filter${stageFilter === 'riesgo' ? ' selected' : ''}`} onClick={() => setStageFilter('riesgo')}>En riesgo</button>
        {STAGES.map((s) => (
          <button key={s} className={`chip chip--filter${stageFilter === s ? ' selected' : ''}`} onClick={() => setStageFilter(s)}>{STAGE_LABELS[s]}</button>
        ))}
      </div>

      {filtered.map((p) => (
        <button key={p.id} className="list-row" style={{ border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={() => onOpenProspect(p.id)}>
          <div>
            <p className="list-row__title">{p.name}</p>
            {isAtRisk(p) ? <Tag variant="risk" icon="alert-triangle">{contactMeta(p)}</Tag> : <p className="list-row__meta">{contactMeta(p)}</p>}
          </div>
          <Badge stage={p.stage} />
        </button>
      ))}

      {filtered.length === 0 && (
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--color-mute)', fontSize: 13.5, textAlign: 'center', padding: '24px 0' }}>
          Sin resultados{query && ` para "${query}"`}.
        </p>
      )}
    </>
  );
}
window.ProspectosList = ProspectosList;
