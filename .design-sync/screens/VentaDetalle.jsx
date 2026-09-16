// Pantalla nueva — /ventas/[id]. Recreación de src/app/(app)/ventas/[id]/page.js
// (ICS-103). "Anular" solo la ve un administrador (sales.void, ICS-101 B3: no
// reabre la oportunidad de origen).
function money(n) { return `$${n.toLocaleString('es-MX')}`; }

function VentaDetalle({ role, saleId, onBack }) {
  const { Icon, IconButton, Button, Tag } = window.MiNegocioCRM;
  const isAdmin = role === 'administrador';
  const sale = window.MOCK_SALES.find((s) => s.id === saleId) || window.MOCK_SALES[0];
  const opportunity = sale.opportunityId ? window.MOCK_OPPORTUNITIES.find((o) => o.id === sale.opportunityId) : null;
  const [confirmingVoid, setConfirmingVoid] = React.useState(false);

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="arrow-left" outline label="Volver" onClick={onBack} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Detalle de venta</p>
        </div>
      </div>

      <div className="id-card">
        <div className="id-card__head">
          <div>
            <p className="id-card__name">{sale.prospectName}</p>
            <p className="id-card__biz">{sale.product}</p>
          </div>
        </div>
        <div className="id-row"><Icon name="dollar-sign" size={16} />{money(sale.amount)}</div>
        <div className="id-row"><Icon name="calendar-clock" size={16} />{sale.closedAt}</div>
        {opportunity ? (
          <div className="id-row"><Icon name="git-branch" size={16} />Originada por: {opportunity.name}</div>
        ) : (
          <div className="id-row"><Icon name="git-branch" size={16} />Venta directa, sin oportunidad de origen</div>
        )}
      </div>

      {sale.voidedAt ? (
        <div className="next-follow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Tag variant="risk">Venta anulada</Tag></div>
          <span className="next-follow__txt">Motivo: {sale.voidReason}</span>
        </div>
      ) : isAdmin ? (
        <div className="action-row">
          {confirmingVoid ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <div className="field-group">
                <label className="field-label" htmlFor="vd-motivo">Motivo de la anulación</label>
                <textarea id="vd-motivo" className="mn-field-text" defaultValue="Se registró el monto incorrecto, corregida en otra venta." />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" full onClick={() => setConfirmingVoid(false)}>Cancelar</Button>
                <Button variant="danger" full onClick={() => setConfirmingVoid(false)}>Confirmar anulación</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" full onClick={() => setConfirmingVoid(true)}>Anular venta</Button>
          )}
        </div>
      ) : null}
    </>
  );
}
window.VentaDetalle = VentaDetalle;
