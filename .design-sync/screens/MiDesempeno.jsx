// Pantalla 10 — Mi desempeño (solo Carlos). Recreación de
// src/app/(app)/mi-desempeno/page.js.
function MiDesempeno() {
  const { PeriodToggle, PerfTile } = window.MiNegocioCRM;
  const [period, setPeriod] = React.useState('semana');
  const suffix = period === 'semana' ? 'semana pasada' : 'mes pasado';

  return (
    <>
      <div className="top-bar">
        <div>
          <p className="top-bar__title">Mi desempeño</p>
          <p className="top-bar__sub">Tus números, para hablar con datos, no con impresiones.</p>
        </div>
      </div>

      <PeriodToggle value={period} onChange={setPeriod} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <PerfTile value="12" label="Prospectos atendidos" delta={`+3 vs. ${suffix}`} direction="up" />
        <PerfTile value="4" label="Ventas cerradas" delta={`+1 vs. ${suffix}`} direction="up" />
        <PerfTile value="28%" label="Tasa de conversión personal" delta={`-4 pts vs. ${suffix}`} direction="down" />
      </div>
    </>
  );
}
window.MiDesempeno = MiDesempeno;
