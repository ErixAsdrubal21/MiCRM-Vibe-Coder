"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { KpiTile } from "@/design/components/core/KpiTile.jsx";
import { useSession } from "@/lib/session.js";

const PERIOD_LABEL = { semana: "semana pasada", mes: "mes pasado" };

function deltaLabel(current, previous, period) {
  const diff = current - previous;
  if (diff === 0) return `Sin cambio vs. ${PERIOD_LABEL[period]}`;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff} vs. ${PERIOD_LABEL[period]}`;
}

export default function MiDesempeno() {
  const session = useSession();
  const [period, setPeriod] = useState("semana");
  const isVendedor = session?.role === "vendedor";
  const data = useQuery(
    api.metrics.myPerformance,
    isVendedor ? { actorId: session.id, period } : "skip"
  );

  if (!isVendedor) return null;

  return (
    <>
      <TopBar title="Mi desempeño" sub="Tus números, para hablar con datos, no con impresiones." />

      <div className="chip-row">
        <button
          type="button"
          className={`chip${period === "semana" ? " selected" : ""}`}
          onClick={() => setPeriod("semana")}
        >
          Semana
        </button>
        <button
          type="button"
          className={`chip${period === "mes" ? " selected" : ""}`}
          onClick={() => setPeriod("mes")}
        >
          Mes
        </button>
      </div>

      {data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
          <div>
            <KpiTile value={data.current.atendidos} label="Prospectos atendidos" />
            <p className="list-row__meta" style={{ marginTop: 4, textAlign: "center" }}>
              {deltaLabel(data.current.atendidos, data.previous.atendidos, period)}
            </p>
          </div>
          <div>
            <KpiTile value={data.current.ventas} label="Ventas cerradas" />
            <p className="list-row__meta" style={{ marginTop: 4, textAlign: "center" }}>
              {deltaLabel(data.current.ventas, data.previous.ventas, period)}
            </p>
          </div>
          <div>
            <KpiTile value={`${data.current.tasaConversion}%`} label="Tasa de conversión" />
            <p className="list-row__meta" style={{ marginTop: 4, textAlign: "center" }}>
              {deltaLabel(data.current.tasaConversion, data.previous.tasaConversion, period)} pts
            </p>
          </div>
        </div>
      ) : (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          Cargando...
        </p>
      )}
    </>
  );
}
