"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { KpiTile } from "@/design/components/core/KpiTile.jsx";
import { useSession } from "@/lib/session.js";
import "./dashboard.css";

function weekRangeLabel() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const month = sunday.toLocaleDateString("es-MX", { month: "long" });
  return `Semana del ${monday.getDate()} al ${sunday.getDate()} de ${month}`;
}

export default function Dashboard() {
  const session = useSession();
  const isAdministrador = session?.role === "administrador";
  const data = useQuery(api.metrics.dashboard, isAdministrador ? { actorId: session.id } : "skip");

  if (!isAdministrador) return null;

  return (
    <>
      <TopBar title={`Hola, ${session.name}`} sub={weekRangeLabel()} />

      {data && data.atRiskCount > 0 && (
        <Link href="/prospectos?risk=1" className="mn-alert-banner" style={{ textDecoration: "none" }}>
          <span className="mn-alert-banner__dot" />
          <span className="mn-alert-banner__txt">
            {data.atRiskCount} prospecto{data.atRiskCount === 1 ? "" : "s"} sin seguimiento
          </span>
          <span className="mn-alert-banner__go">Ver →</span>
        </Link>
      )}

      {data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <KpiTile value={data.activeCount} label="Prospectos activos" />
            <KpiTile value={data.salesThisWeek} label="Ventas esta semana" />
            <KpiTile value={data.salesThisMonth} label="Ventas este mes" />
            <KpiTile value={`${data.conversionThisMonth}%`} label="Tasa de conversión" />
            <Link href="/prospectos?risk=1" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
              <KpiTile value={data.atRiskCount} label="Sin seguimiento" warn={data.atRiskCount > 0} />
            </Link>
            <KpiTile value={`${data.tasksToday.completadas}/${data.tasksToday.total}`} label={`Tareas de ${data.carlos?.name ?? "el vendedor"} hoy`} />
          </div>

          {data.carlos && (
            <>
              <p className="section-label">Esta semana</p>
              <div className="rank-row">
                <span className="rank-row__who">{data.carlos.name} — tasa de conversión</span>
                <span className="rank-row__val">{data.carlos.conversionThisWeek}%</span>
              </div>
            </>
          )}
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          Cargando...
        </p>
      )}
    </>
  );
}
