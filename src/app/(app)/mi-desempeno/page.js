"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { PeriodToggle } from "@/design/components/core/PeriodToggle.jsx";
import { PerfTile } from "@/design/components/core/PerfTile.jsx";
import { useSession } from "@/lib/session.js";

const PERIOD_LABEL = { semana: "semana pasada", mes: "mes pasado" };

function delta(current, previous, period, suffix = "") {
  const diff = current - previous;
  if (diff === 0) return { text: `Sin cambio vs. ${PERIOD_LABEL[period]}`, direction: "flat" };
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff}${suffix} vs. ${PERIOD_LABEL[period]}`, direction: diff > 0 ? "up" : "down" };
}

export default function MiDesempeno() {
  const session = useSession();
  const [period, setPeriod] = useState("semana");
  const isVendedor = session?.role === "vendedor";
  const data = useQuery(
    api.metrics.myPerformance,
    isVendedor ? { period } : "skip"
  );

  if (!isVendedor) return null;

  const atendidosDelta = data && delta(data.current.atendidos, data.previous.atendidos, period);
  const ventasDelta = data && delta(data.current.ventas, data.previous.ventas, period);
  const conversionDelta = data && delta(data.current.tasaConversion, data.previous.tasaConversion, period, " pts");

  return (
    <>
      <TopBar title="Mi desempeño" sub="Tus números, para hablar con datos, no con impresiones." />

      <PeriodToggle value={period} onChange={setPeriod} />

      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          <PerfTile value={data.current.atendidos} label="Prospectos atendidos" delta={atendidosDelta.text} direction={atendidosDelta.direction} />
          <PerfTile value={data.current.ventas} label="Ventas cerradas" delta={ventasDelta.text} direction={ventasDelta.direction} />
          <PerfTile value={`${data.current.tasaConversion}%`} label="Tasa de conversión personal" delta={conversionDelta.text} direction={conversionDelta.direction} />
        </div>
      ) : (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          Cargando...
        </p>
      )}
    </>
  );
}
