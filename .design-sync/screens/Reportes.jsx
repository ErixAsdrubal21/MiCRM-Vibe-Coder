// Pantalla 9 — Reportes (solo Marta). Recreación de src/app/(app)/reportes/page.js.
function money(n) { return `$${n.toLocaleString('es-MX')}`; }
const OPP_STAGE_LABEL = { calificacion: 'Calificación', cotizacion: 'Cotización', negociacion: 'Negociación', ganada: 'Ganada', perdida: 'Perdida' };

function Reportes() {
  const { IconButton, PeriodToggle } = window.MiNegocioCRM;
  const [period, setPeriod] = React.useState('semana');
  const data = window.MOCK_REPORTES;
  const periodLabel = period === 'semana' ? 'esta semana' : 'este mes';

  return (
    <>
      <div className="top-bar">
        <p className="top-bar__title">Reportes</p>
        <IconButton icon="download" label="Exportar reporte" />
      </div>

      <PeriodToggle value={period} onChange={setPeriod} />

      <details className="report-card" open>
        <summary className="report-card__title">Ventas — {periodLabel}</summary>
        <div className="report-grid">
          <div><span className="report-stat__num">{data.ventas.nuevos}</span><span className="report-stat__label">Prospectos nuevos</span></div>
          <div><span className="report-stat__num">{data.ventas.cerradas}</span><span className="report-stat__label">Ventas cerradas</span></div>
          <div><span className="report-stat__num">{money(data.ventas.valorTotal)}</span><span className="report-stat__label">Valor total</span></div>
          <div><span className="report-stat__num">{data.ventas.conversion}%</span><span className="report-stat__label">Tasa de conversión</span></div>
        </div>
        <div className="report-detail">
          {data.ventas.detalle.map((s) => (
            <div className="report-detail__row" key={s.key}><span>{s.name}</span><span>{money(s.amount)} · {s.product}</span></div>
          ))}
        </div>
      </details>

      <details className="report-card">
        <summary className="report-card__title">Pérdidas — {periodLabel}</summary>
        <div className="report-grid">
          <div><span className="report-stat__num">{data.perdidas.total}</span><span className="report-stat__label">Prospectos perdidos</span></div>
        </div>
        <p className="section-label" style={{ marginTop: 2 }}>Motivo</p>
        {data.perdidas.porMotivo.map((m) => (
          <div className="loss-row" key={m.reason}><span className="loss-row__reason">{m.label}</span><span className="loss-row__count">{m.count}</span></div>
        ))}
        <div className="report-detail">
          {data.perdidas.detalle.map((p) => (
            <div className="report-detail__row" key={p.key}><span>{p.name}</span><span>{p.reasonLabel}</span></div>
          ))}
        </div>
      </details>

      {/* ICS-105 — bloque de oportunidades. */}
      <details className="report-card">
        <summary className="report-card__title">Oportunidades — {periodLabel}</summary>
        <div className="report-grid">
          <div><span className="report-stat__num">{money(window.MOCK_OPORTUNIDADES_METRICS.pipelineValue)}</span><span className="report-stat__label">Valor de pipeline</span></div>
          <div><span className="report-stat__num">{money(window.MOCK_OPORTUNIDADES_METRICS.forecast)}</span><span className="report-stat__label">Forecast ponderado</span></div>
          <div><span className="report-stat__num">{window.MOCK_OPORTUNIDADES_METRICS.conversionThisMonth}%</span><span className="report-stat__label">Conversión de oportunidades</span></div>
          <div><span className="report-stat__num">{money(window.MOCK_OPORTUNIDADES_METRICS.avgTicketThisMonth)}</span><span className="report-stat__label">Ticket promedio</span></div>
        </div>
        <p className="section-label" style={{ marginTop: 2 }}>Embudo</p>
        <div className="report-detail">
          {window.MOCK_OPORTUNIDADES_METRICS.funnel.map((f) => (
            <div className="report-detail__row" key={f.stage}><span>{OPP_STAGE_LABEL[f.stage]}</span><span>{f.count}</span></div>
          ))}
        </div>
      </details>
    </>
  );
}
window.Reportes = Reportes;
