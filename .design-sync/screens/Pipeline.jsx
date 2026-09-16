// Pantalla 8 — Pipeline de ventas. Recreación de src/app/(app)/pipeline/page.js.
const STAGES = ['nuevo', 'contactado', 'cotizacion', 'negociacion', 'ganado', 'perdido'];
const DAYS_LABEL = { nuevo: '2 días', contactado: '1 día', cotizacion: '5 días', negociacion: '3 días' };

function Pipeline({ role, onOpenProspect }) {
  const { Badge, IconButton } = window.MiNegocioCRM;
  const groups = STAGES.map((stage) => {
    const items = window.MOCK_PROSPECTS.filter((p) => p.stage === stage);
    const isClosed = stage === 'ganado' || stage === 'perdido';
    return { stage, items, countLabel: isClosed ? `${items.length} este mes` : `${items.length} prospecto${items.length === 1 ? '' : 's'}` };
  });

  return (
    <>
      {/* ICS-103: renombrado — el pipeline comercial real vive en /ventas. */}
      <div className="top-bar"><p className="top-bar__title">Embudo de prospectos</p></div>

      {groups.map((group) => (
        <div className="stage-block" key={group.stage}>
          <div className="stage-block__head">
            <div className="stage-block__head-left">
              <Badge stage={group.stage} />
              <span className="stage-block__count">{group.countLabel}</span>
            </div>
          </div>
          {group.items.length > 0 && (
            <div className="stage-block__rows">
              {group.items.map((p) => (
                <div className="stage-block__row" key={p.id}>
                  <button className="stage-block__row-name" onClick={() => onOpenProspect(p.id)}>{p.name}</button>
                  <div className="stage-block__row-right">
                    <span className="stage-block__row-days">
                      {p.stage === 'perdido' ? 'precio' : p.stage === 'ganado' ? 'hace 2 días' : DAYS_LABEL[p.stage]}
                    </span>
                    {role === 'vendedor' && <IconButton icon="arrow-right-left" label={`Cambiar etapa de ${p.name}`} outline />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
window.Pipeline = Pipeline;
