"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { PeriodToggle } from "@/design/components/core/PeriodToggle.jsx";
import { useSession } from "@/lib/session.js";
import { LOSS_REASONS } from "@/lib/prospects.js";
import "./reportes.css";

const PERIOD_LABEL = { semana: "esta semana", mes: "este mes" };
const REASON_LABEL = Object.fromEntries(LOSS_REASONS.map((r) => [r.value, r.label]));

function money(n) {
  return `$${n.toLocaleString("es-MX")}`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(data, period) {
  const rows = [
    ["Reporte", PERIOD_LABEL[period]],
    [],
    ["Ventas", "Prospectos nuevos", "Ventas cerradas", "Valor total", "Tasa de conversión"],
    ["", data.ventas.nuevos, data.ventas.cerradas, data.ventas.valorTotal, `${data.ventas.conversion}%`],
    [],
    ["Detalle de ventas", "Prospecto", "Monto", "Producto", "Fecha"],
    ...data.ventas.detalle.map((s) => ["", s.name, s.amount, s.product, new Date(s.closedAt).toLocaleDateString("es-MX")]),
    [],
    ["Pérdidas", "Total"],
    ["", data.perdidas.total],
    [],
    ["Motivo", "Cantidad"],
    ...data.perdidas.porMotivo.map((m) => [REASON_LABEL[m.reason] ?? m.reason, m.count]),
    [],
    ["Detalle de pérdidas", "Prospecto", "Motivo", "Fecha"],
    ...data.perdidas.detalle.map((p) => ["", p.name, REASON_LABEL[p.reason] ?? p.reason, new Date(p.at).toLocaleDateString("es-MX")]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reportes() {
  const session = useSession();
  const isAdministrador = session?.role === "administrador";
  const [period, setPeriod] = useState("semana");
  const data = useQuery(api.metrics.reportes, isAdministrador ? { period } : "skip");

  if (!isAdministrador) return null;

  return (
    <>
      <div className="top-bar">
        <p className="top-bar__title">Reportes</p>
        <IconButton icon="download" label="Exportar reporte" disabled={!data} onClick={() => data && exportCsv(data, period)} />
      </div>

      <PeriodToggle value={period} onChange={setPeriod} />

      {!data ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          Cargando...
        </p>
      ) : (
        <>
          <details className="report-card" open>
            <summary className="report-card__title">Ventas — {PERIOD_LABEL[period]}</summary>
            <div className="report-grid">
              <div><span className="report-stat__num">{data.ventas.nuevos}</span><span className="report-stat__label">Prospectos nuevos</span></div>
              <div><span className="report-stat__num">{data.ventas.cerradas}</span><span className="report-stat__label">Ventas cerradas</span></div>
              <div><span className="report-stat__num">{money(data.ventas.valorTotal)}</span><span className="report-stat__label">Valor total</span></div>
              <div><span className="report-stat__num">{data.ventas.conversion}%</span><span className="report-stat__label">Tasa de conversión</span></div>
            </div>
            {data.ventas.detalle.length > 0 && (
              <div className="report-detail">
                {data.ventas.detalle.map((s) => (
                  <div className="report-detail__row" key={s.prospectId + s.closedAt}>
                    <span>{s.name}</span>
                    <span>{money(s.amount)} · {s.product}</span>
                  </div>
                ))}
              </div>
            )}
          </details>

          <details className="report-card">
            <summary className="report-card__title">Pérdidas — {PERIOD_LABEL[period]}</summary>
            <div className="report-grid">
              <div><span className="report-stat__num">{data.perdidas.total}</span><span className="report-stat__label">Prospectos perdidos</span></div>
            </div>
            {data.perdidas.porMotivo.length > 0 && (
              <>
                <p className="section-label" style={{ marginTop: 2 }}>Motivo</p>
                {data.perdidas.porMotivo.map((m) => (
                  <div className="loss-row" key={m.reason}>
                    <span className="loss-row__reason">{REASON_LABEL[m.reason] ?? m.reason}</span>
                    <span className="loss-row__count">{m.count}</span>
                  </div>
                ))}
              </>
            )}
            {data.perdidas.detalle.length > 0 && (
              <div className="report-detail">
                {data.perdidas.detalle.map((p) => (
                  <div className="report-detail__row" key={p.prospectId}>
                    <span>{p.name}</span>
                    <span>{REASON_LABEL[p.reason] ?? p.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </details>
        </>
      )}
    </>
  );
}
