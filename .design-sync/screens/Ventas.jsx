// Pantalla nueva — /ventas. Recreación de src/app/(app)/ventas/page.js (ICS-103).
// Dos vistas conmutables sobre las oportunidades/ventas de MOCK_OPPORTUNITIES/
// MOCK_SALES. Ganar/editar/marcar perdida viven en la Ficha (ICS-104), no aquí.
function money(n) { return `$${n.toLocaleString('es-MX')}`; }
const OPP_STAGE_CHIPS = [
  { value: null, label: 'Todas' },
  { value: 'calificacion', label: 'Calificación' },
  { value: 'cotizacion', label: 'Cotización' },
  { value: 'negociacion', label: 'Negociación' },
  { value: 'ganada', label: 'Ganada' },
  { value: 'perdida', label: 'Perdida' },
];

function Ventas({ role, onOpenProspect, onVerVenta, onNuevaOportunidad, onNuevaVenta }) {
  const { IconButton, Button, Badge, Tag, PeriodToggle } = window.MiNegocioCRM;
  const isAdmin = role === 'administrador';
  const [view, setView] = React.useState('oportunidades');
  const [stageFilter, setStageFilter] = React.useState(null);
  const [includeVoided, setIncludeVoided] = React.useState(false);

  const opportunities = window.MOCK_OPPORTUNITIES.filter((o) => !stageFilter || o.stage === stageFilter);
  const sales = window.MOCK_SALES.filter((s) => includeVoided || !s.voidedAt);

  return (
    <>
      <div className="top-bar">
        <p className="top-bar__title">Ventas</p>
        <IconButton icon="download" label="Exportar CSV" />
      </div>

      <PeriodToggle
        value={view}
        onChange={setView}
        options={[{ value: 'oportunidades', label: 'Oportunidades' }, { value: 'ventas', label: 'Ventas' }]}
      />

      {view === 'oportunidades' ? (
        <>
          <div className="chip-row chip-row--scroll" style={{ marginTop: 10 }}>
            {OPP_STAGE_CHIPS.map((c) => (
              <button key={c.label} type="button" className={`chip chip--filter${stageFilter === c.value ? ' selected' : ''}`} onClick={() => setStageFilter(c.value)}>
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {isAdmin || <Button variant="secondary" onClick={onNuevaOportunidad}>+ Nueva oportunidad</Button>}

            {opportunities.length === 0 ? (
              <p className="empty-state">Sin oportunidades{stageFilter ? ' en esta etapa' : ''}.</p>
            ) : (
              opportunities.map((o) => (
                <button key={o.id} className="opp-row" onClick={() => onOpenProspect(o.prospectId)}>
                  <div className="opp-row__head">
                    <span className="list-row__title">{o.prospectName}</span>
                    <Badge stage={o.stage} />
                  </div>
                  <div className="opp-row__meta"><span>{o.name} · {o.product}</span></div>
                  <div className="opp-row__head">
                    {o.estimatedAmount != null ? (
                      <span className="opp-row__amount">{money(o.estimatedAmount)}</span>
                    ) : (
                      <Tag variant="neutral">Monto pendiente</Tag>
                    )}
                    {o.expectedCloseDate && <span className="opp-row__meta">Esperada: {o.expectedCloseDate}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--color-mute)', padding: '10px 2px 0' }}>
            <input type="checkbox" checked={includeVoided} onChange={(e) => setIncludeVoided(e.target.checked)} />
            Incluir anuladas
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {isAdmin || <Button variant="secondary" onClick={onNuevaVenta}>+ Registrar venta directa</Button>}

            {sales.length === 0 ? (
              <p className="empty-state">Sin ventas registradas.</p>
            ) : (
              sales.map((s) => (
                <button key={s.id} className={`sale-row${s.voidedAt ? ' sale-row--voided' : ''}`} onClick={() => onVerVenta(s.id)}>
                  <div className="sale-row__head">
                    <span className="list-row__title">{s.prospectName}</span>
                    <span className="sale-row__amount">{money(s.amount)}</span>
                  </div>
                  <div className="sale-row__meta">
                    <span>{s.product}</span>
                    <span>· {s.closedAt}</span>
                    {s.voidedAt && <Tag variant="risk">Venta anulada</Tag>}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
window.Ventas = Ventas;
