// Pantalla 3 — Dashboard ejecutivo (inicio de Marta). Recreación de
// src/app/(app)/dashboard/page.js.
function weekRangeLabel() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const month = sunday.toLocaleDateString('es-MX', { month: 'long' });
  return `Semana del ${monday.getDate()} al ${sunday.getDate()} de ${month}`;
}

function Dashboard({ onGoToRiesgo }) {
  const { KpiTile } = window.MiNegocioCRM;
  const data = window.MOCK_DASHBOARD;

  return (
    <>
      <div className="top-bar">
        <div>
          <p className="top-bar__title">Hola, Marta</p>
          <p className="top-bar__sub">{weekRangeLabel()}</p>
        </div>
      </div>

      {data.atRiskCount > 0 && (
        <a className="mn-alert-banner" href="#" style={{ textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); onGoToRiesgo(); }}>
          <span className="mn-alert-banner__dot" />
          <span className="mn-alert-banner__txt">{data.atRiskCount} prospectos sin seguimiento</span>
          <span className="mn-alert-banner__go">Ver →</span>
        </a>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <KpiTile value={data.activeCount} label="Prospectos activos" />
        <KpiTile value={data.salesThisWeek} label="Ventas esta semana" />
        <KpiTile value={data.salesThisMonth} label="Ventas este mes" />
        <KpiTile value={`${data.conversionThisMonth}%`} label="Tasa de conversión" />
        <a href="#" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }} onClick={(e) => { e.preventDefault(); onGoToRiesgo(); }}>
          <KpiTile value={data.atRiskCount} label="Sin seguimiento" warn={data.atRiskCount > 0} />
        </a>
        <KpiTile value={`${data.tasksToday.completadas}/${data.tasksToday.total}`} label={`Tareas de ${data.carlos.name} hoy`} />
      </div>

      <p className="section-label">Esta semana</p>
      <div className="rank-row">
        <span className="rank-row__who">{data.carlos.name} — tasa de conversión</span>
        <span className="rank-row__val">{data.carlos.conversionThisWeek}%</span>
      </div>
    </>
  );
}
window.Dashboard = Dashboard;
