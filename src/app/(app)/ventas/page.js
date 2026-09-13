"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { PeriodToggle } from "@/design/components/core/PeriodToggle.jsx";
import { useSession } from "@/lib/session.js";
import "./ventas.css";

/**
 * ICS-103 — pantalla global /ventas: dos vistas conmutables sobre
 * `opportunities.list`/`sales.list` (ICS-100/101). Ganar/editar/marcar
 * perdida viven en la ficha del cliente (ICS-104), no aquí — esta pantalla
 * es de descubrimiento + alta, no de gestión fila por fila.
 */

const VIEW_OPTIONS = [
  { value: "oportunidades", label: "Oportunidades" },
  { value: "ventas", label: "Ventas" },
];

const OPP_STAGE_CHIPS = [
  { value: undefined, label: "Todas" },
  { value: "calificacion", label: "Calificación" },
  { value: "cotizacion", label: "Cotización" },
  { value: "negociacion", label: "Negociación" },
  { value: "ganada", label: "Ganada" },
  { value: "perdida", label: "Perdida" },
];

function money(n) {
  return `$${n.toLocaleString("es-MX")}`;
}
function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Ventas() {
  const session = useSession();
  const router = useRouter();
  const isAdmin = session?.role === "administrador";

  const [view, setView] = useState("oportunidades");
  const [stageFilter, setStageFilter] = useState(undefined);
  const [vendorFilter, setVendorFilter] = useState(undefined);
  const [includeVoided, setIncludeVoided] = useState(false);

  const team = useQuery(api.users.listTeam, isAdmin ? {} : "skip");
  const vendors = (team ?? []).filter((u) => u.role === "vendedor");

  const opportunities = usePaginatedQuery(
    api.opportunities.list,
    view === "oportunidades" ? { filters: { stage: stageFilter, ownerId: isAdmin ? vendorFilter : undefined } } : "skip",
    { initialNumItems: 20 },
  );

  const sales = usePaginatedQuery(
    api.sales.list,
    view === "ventas" ? { filters: { ownerId: isAdmin ? vendorFilter : undefined, includeVoided } } : "skip",
    { initialNumItems: 20 },
  );

  if (!session) return null;

  function exportOpportunitiesCsv() {
    const rows = [
      ["Cliente", "Nombre", "Producto", "Etapa", "Monto estimado", "Fecha esperada"],
      ...opportunities.results.map((o) => [
        o.prospectName ?? "",
        o.name,
        o.product,
        o.stage,
        o.estimatedAmount ?? "",
        o.expectedCloseDate ?? "",
      ]),
    ];
    downloadCsv(`oportunidades-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
  function exportSalesCsv() {
    const rows = [
      ["Cliente", "Monto", "Producto", "Fecha", "Anulada"],
      ...sales.results.map((s) => [
        s.prospectName ?? "",
        s.amount,
        s.product,
        new Date(s.closedAt).toLocaleDateString("es-MX"),
        s.voidedAt ? "sí" : "no",
      ]),
    ];
    downloadCsv(`ventas-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const oppEmpty = opportunities.results.length === 0 && opportunities.status !== "LoadingFirstPage";
  const salesEmpty = sales.results.length === 0 && sales.status !== "LoadingFirstPage";

  return (
    <>
      <div className="top-bar">
        <p className="top-bar__title">Ventas</p>
        <IconButton
          icon="download"
          label="Exportar CSV"
          disabled={view === "oportunidades" ? oppEmpty : salesEmpty}
          onClick={view === "oportunidades" ? exportOpportunitiesCsv : exportSalesCsv}
        />
      </div>

      <PeriodToggle value={view} onChange={setView} options={VIEW_OPTIONS} />

      {isAdmin && vendors.length > 0 && (
        <div className="chip-row chip-row--scroll" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`chip chip--filter${vendorFilter === undefined ? " selected" : ""}`}
            onClick={() => setVendorFilter(undefined)}
          >
            Todo el equipo
          </button>
          {vendors.map((v) => (
            <button
              key={v._id}
              type="button"
              className={`chip chip--filter${vendorFilter === v._id ? " selected" : ""}`}
              onClick={() => setVendorFilter(v._id)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {view === "oportunidades" ? (
        <>
          <div className="chip-row chip-row--scroll" style={{ marginTop: 10 }}>
            {OPP_STAGE_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                className={`chip chip--filter${stageFilter === c.value ? " selected" : ""}`}
                onClick={() => setStageFilter(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <Button variant="secondary" onClick={() => router.push("/ventas/nueva-oportunidad")}>
              + Nueva oportunidad
            </Button>

            {oppEmpty ? (
              <p className="empty-state">Sin oportunidades{stageFilter ? " en esta etapa" : ""}.</p>
            ) : (
              opportunities.results.map((o) => (
                <button key={o._id} className="opp-row" onClick={() => router.push(`/prospectos/${o.prospectId}`)}>
                  <div className="opp-row__head">
                    <span className="list-row__title">{o.prospectName ?? "Cliente"}</span>
                    <Badge stage={o.stage} />
                  </div>
                  <div className="opp-row__meta">
                    <span>{o.name} · {o.product}</span>
                  </div>
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
            {opportunities.status === "CanLoadMore" && (
              <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => opportunities.loadMore(20)}>
                Ver más
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-ui)",
              fontSize: 12.5,
              color: "var(--color-mute)",
              padding: "10px 2px 0",
            }}
          >
            <input type="checkbox" checked={includeVoided} onChange={(e) => setIncludeVoided(e.target.checked)} />
            Incluir anuladas
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <Button variant="secondary" onClick={() => router.push("/ventas/nueva-venta")}>
              + Registrar venta directa
            </Button>

            {salesEmpty ? (
              <p className="empty-state">Sin ventas registradas.</p>
            ) : (
              sales.results.map((s) => (
                <button
                  key={s._id}
                  className={`sale-row${s.voidedAt ? " sale-row--voided" : ""}`}
                  onClick={() => router.push(`/ventas/${s._id}`)}
                >
                  <div className="sale-row__head">
                    <span className="list-row__title">{s.prospectName ?? "Cliente"}</span>
                    <span className="sale-row__amount">{money(s.amount)}</span>
                  </div>
                  <div className="sale-row__meta">
                    <span>{s.product}</span>
                    <span>· {new Date(s.closedAt).toLocaleDateString("es-MX")}</span>
                    {s.voidedAt && <Tag variant="risk">Venta anulada</Tag>}
                  </div>
                </button>
              ))
            )}
            {sales.status === "CanLoadMore" && (
              <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => sales.loadMore(20)}>
                Ver más
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
