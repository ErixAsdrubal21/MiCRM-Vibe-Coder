"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useConvex } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { PeriodToggle } from "@/design/components/core/PeriodToggle.jsx";
import { useSession } from "@/lib/session.js";
import { isoToLocalMs } from "@/lib/dates.js";
import {
  CONTACT_TYPE_VALUES,
  CONTACT_TYPE_LABELS,
  CONTACT_TYPE_ICONS,
  OUTCOME_VALUES,
  OUTCOME_LABELS,
  RESOLUTION_LABELS,
} from "../../../../shared/crmEnums.js";
import "./actividad.css";

/**
 * ICS-88 — pantalla global /actividad: dos vistas sobre backend ya listo
 * desde ICS-81 (`interactions.feed`, `followUps.list`). ICS-82 (diseño) se
 * resolvió inline con el Design System existente, sin artboard Figma aparte
 * — mismo criterio que ya se aplicó en ICS-86 para ICS-83.
 *
 * La seguridad de "vendedor solo ve lo suyo" vive en el backend
 * (`interactions.feed`/`followUps.list` fuerzan `scopedVendedorId`/
 * `scopedOwnerId` a `user._id` del lado del servidor) — aquí solo se OCULTA
 * el selector de vendedor para ese rol, no es la barrera real.
 */

const VIEW_OPTIONS = [
  { value: "interacciones", label: "Interacciones" },
  { value: "seguimientos", label: "Seguimientos" },
];

const ESTADO_CHIPS = [
  { value: undefined, label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "vencido", label: "Vencido" },
  { value: "completado", label: "Completado" },
];

const OUTCOME_TAG_VARIANT = { positivo: "success", negativo: "risk", neutro: "neutral", "sin-respuesta": "neutral" };
const RESOLUTION_TAG_VARIANT = { hecho: "success", "no-contactado": "neutral", reprogramado: "neutral", cancelado: "risk" };

const MAX_EXPORT_PAGES = 20; // tope documentado — no existe una query "todo sin paginar" y no vale la pena crear una solo para el CSV.

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

function relativeDate(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}`;
}

export default function Actividad() {
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const convex = useConvex();
  const isAdmin = session?.role === "administrador";

  const [view, setView] = useState(() => (searchParams.get("vista") === "seguimientos" ? "seguimientos" : "interacciones"));
  const [tipo, setTipo] = useState(() => searchParams.get("tipo") ?? undefined);
  const [resultado, setResultado] = useState(() => searchParams.get("resultado") ?? undefined);
  const [estado, setEstado] = useState(() => searchParams.get("estado") ?? undefined);
  const [vendedorId, setVendedorId] = useState(() => searchParams.get("vendedor") ?? undefined);
  const [desde, setDesde] = useState(() => searchParams.get("desde") ?? "");
  const [hasta, setHasta] = useState(() => searchParams.get("hasta") ?? "");
  const [prospectoId, setProspectoId] = useState(() => searchParams.get("prospecto") ?? undefined);
  const [prospectoNombre, setProspectoNombre] = useState(null); // se resuelve tras la primera respuesta del feed/lista si llegó por URL
  const [prospectoQuery, setProspectoQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  // Refleja el estado en la URL — así el deep-link del dashboard
  // (?vista=seguimientos&estado=vencidos) es reproducible/compartible.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "interacciones") params.set("vista", view);
    if (tipo) params.set("tipo", tipo);
    if (resultado) params.set("resultado", resultado);
    if (estado) params.set("estado", estado);
    if (vendedorId) params.set("vendedor", vendedorId);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (prospectoId) params.set("prospecto", prospectoId);
    const qs = params.toString();
    router.replace(`/actividad${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tipo, resultado, estado, vendedorId, desde, hasta, prospectoId]);

  const team = useQuery(api.users.listTeam, isAdmin ? {} : "skip");
  const vendors = (team ?? []).filter((u) => u.role === "vendedor");

  const suggestions = useQuery(api.prospects.search, prospectoQuery.trim() ? { query: prospectoQuery.trim() } : "skip");

  const fromMs = desde ? isoToLocalMs(desde) : undefined;
  const toMs = hasta ? isoToLocalMs(hasta) + 24 * 60 * 60 * 1000 - 1 : undefined;

  const feed = usePaginatedQuery(
    api.interactions.feed,
    view === "interacciones"
      ? { filters: { vendedorId, type: tipo, outcome: resultado, from: fromMs, to: toMs, prospectExactId: prospectoId } }
      : "skip",
    { initialNumItems: 20 },
  );

  const followUps = usePaginatedQuery(
    api.followUps.list,
    view === "seguimientos"
      ? { filters: { estado, vendedorId, from: fromMs, to: toMs } }
      : "skip",
    { initialNumItems: 20 },
  );

  // Si el filtro de prospecto llegó por deep-link (no por el autocompletar,
  // que ya guarda el nombre en `prospectoNombre`), se deriva de la primera
  // fila que aparezca con ese id — sin efecto ni setState extra.
  const resolvedProspectoNombre =
    prospectoNombre ??
    (prospectoId &&
      (feed.results.find((i) => i.prospectId === prospectoId)?.prospectName ??
        followUps.results.find((f) => f.prospectId === prospectoId)?.prospectName)) ??
    null;

  function selectProspecto(p) {
    setProspectoId(p._id);
    setProspectoNombre(p.name);
    setProspectoQuery("");
  }
  function clearProspecto() {
    setProspectoId(undefined);
    setProspectoNombre(null);
    setProspectoQuery("");
  }

  const hasFilters = Boolean(tipo || resultado || estado || vendedorId || desde || hasta || prospectoId);
  function clearFilters() {
    setTipo(undefined);
    setResultado(undefined);
    setEstado(undefined);
    setVendedorId(undefined);
    setDesde("");
    setHasta("");
    clearProspecto();
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = [];
      let cursor = null;
      let page = 0;
      if (view === "interacciones") {
        rows.push(["Prospecto", "Etapa", "Tipo", "Resultado", "Autor", "Fecha", "Nota"]);
        while (page < MAX_EXPORT_PAGES) {
          const res = await convex.query(api.interactions.feed, {
            paginationOpts: { numItems: 100, cursor },
            filters: { vendedorId, type: tipo, outcome: resultado, from: fromMs, to: toMs, prospectExactId: prospectoId },
          });
          for (const i of res.page) {
            rows.push([
              i.prospectName ?? "",
              i.stage ?? "",
              CONTACT_TYPE_LABELS[i.type] ?? i.type,
              i.outcome ? OUTCOME_LABELS[i.outcome] : "",
              i.registeredByName ?? "",
              new Date(i.at).toLocaleString("es-MX"),
              i.note,
            ]);
          }
          page += 1;
          if (res.isDone) break;
          cursor = res.continueCursor;
        }
        downloadCsv(`actividad-interacciones-${new Date().toISOString().slice(0, 10)}.csv`, rows);
      } else {
        rows.push(["Prospecto", "Fecha", "Tipo", "Estado", "Resolución"]);
        while (page < MAX_EXPORT_PAGES) {
          const res = await convex.query(api.followUps.list, {
            paginationOpts: { numItems: 100, cursor },
            filters: { estado, vendedorId, from: fromMs, to: toMs },
          });
          for (const f of res.page) {
            const estadoLabel = f.status === "completado" ? "Completado" : f.vencido ? "Vencido" : "Pendiente";
            rows.push([
              f.prospectName ?? "",
              new Date(f.at).toLocaleDateString("es-MX"),
              CONTACT_TYPE_LABELS[f.type] ?? f.type,
              estadoLabel,
              f.resolution ? RESOLUTION_LABELS[f.resolution] : "",
            ]);
          }
          page += 1;
          if (res.isDone) break;
          cursor = res.continueCursor;
        }
        downloadCsv(`actividad-seguimientos-${new Date().toISOString().slice(0, 10)}.csv`, rows);
      }
    } finally {
      setExporting(false);
    }
  }

  if (!session) return null;

  const feedEmpty = feed.results.length === 0 && feed.status !== "LoadingFirstPage";
  const followUpsEmpty = followUps.results.length === 0 && followUps.status !== "LoadingFirstPage";
  const currentEmpty = view === "interacciones" ? feedEmpty : followUpsEmpty;
  const currentLoading = view === "interacciones" ? feed.status === "LoadingFirstPage" : followUps.status === "LoadingFirstPage";

  return (
    <>
      <div className="top-bar">
        <p className="top-bar__title">Actividad</p>
        <IconButton icon="download" label="Exportar CSV" disabled={currentEmpty || exporting} onClick={exportCsv} />
      </div>

      <PeriodToggle value={view} onChange={setView} options={VIEW_OPTIONS} />

      {isAdmin && vendors.length > 0 && (
        <div className="chip-row chip-row--scroll" style={{ marginTop: 10 }}>
          <button type="button" className={`chip chip--filter${!vendedorId ? " selected" : ""}`} onClick={() => setVendedorId(undefined)}>
            Todo el equipo
          </button>
          {vendors.map((v) => (
            <button key={v._id} type="button" className={`chip chip--filter${vendedorId === v._id ? " selected" : ""}`} onClick={() => setVendedorId(v._id)}>
              {v.name}
            </button>
          ))}
        </div>
      )}

      {view === "interacciones" ? (
        <>
          <div className="chip-row chip-row--scroll" style={{ marginTop: 10 }}>
            <button type="button" className={`chip chip--filter${!tipo ? " selected" : ""}`} onClick={() => setTipo(undefined)}>Todos los tipos</button>
            {CONTACT_TYPE_VALUES.map((t) => (
              <button key={t} type="button" className={`chip chip--filter${tipo === t ? " selected" : ""}`} onClick={() => setTipo(t)}>
                {CONTACT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="chip-row chip-row--scroll" style={{ marginTop: 6 }}>
            <button type="button" className={`chip chip--filter${!resultado ? " selected" : ""}`} onClick={() => setResultado(undefined)}>Cualquier resultado</button>
            {OUTCOME_VALUES.map((o) => (
              <button key={o} type="button" className={`chip chip--filter${resultado === o ? " selected" : ""}`} onClick={() => setResultado(o)}>
                {OUTCOME_LABELS[o]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="chip-row chip-row--scroll" style={{ marginTop: 10 }}>
          {ESTADO_CHIPS.map((c) => (
            <button key={c.label} type="button" className={`chip chip--filter${estado === c.value ? " selected" : ""}`} onClick={() => setEstado(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="activity-filters-row">
        <div className="activity-date-range">
          <label className="mn-input mn-input--field">
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
          <span className="activity-date-range__sep">–</span>
          <label className="mn-input mn-input--field">
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>

        <div className="activity-prospect-search">
          {prospectoId && resolvedProspectoNombre ? (
            <span className="chip chip--filter selected">
              {resolvedProspectoNombre}
              <button type="button" className="activity-prospect-clear" onClick={clearProspecto} aria-label="Quitar filtro de cliente">×</button>
            </span>
          ) : (
            <div className="activity-prospect-input-wrap">
              <label className="mn-input mn-input--field">
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={prospectoQuery}
                  onChange={(e) => setProspectoQuery(e.target.value)}
                  style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
                />
              </label>
              {prospectoQuery.trim() && suggestions && suggestions.length > 0 && (
                <div className="activity-prospect-suggestions">
                  {suggestions.map((p) => (
                    <button key={p._id} type="button" onClick={() => selectProspecto(p)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {hasFilters && (
          <button type="button" className="mn-button mn-button--ghost" onClick={clearFilters}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {currentLoading ? (
          <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
            Cargando...
          </p>
        ) : currentEmpty ? (
          <p className="empty-state">
            {hasFilters ? "Sin resultados con estos filtros." : view === "interacciones" ? "Todavía no hay interacciones registradas." : "Sin seguimientos registrados."}
          </p>
        ) : view === "interacciones" ? (
          <>
            {feed.results.map((i) => (
              <button key={i._id} className="feed-row" onClick={() => router.push(`/prospectos/${i.prospectId}`)}>
                <div className="feed-row__head">
                  <span className="list-row__title">{i.prospectName ?? "Prospecto"}</span>
                  {i.stage && <Badge stage={i.stage} />}
                </div>
                <div className="feed-row__meta">
                  <span className="feed-row__type"><Tag icon={CONTACT_TYPE_ICONS[i.type]}>{CONTACT_TYPE_LABELS[i.type] ?? i.type}</Tag></span>
                  {i.outcome && <Tag variant={OUTCOME_TAG_VARIANT[i.outcome] ?? "neutral"}>{OUTCOME_LABELS[i.outcome]}</Tag>}
                  {isAdmin && i.registeredByName && <span className="feed-row__author">{i.registeredByName}</span>}
                  <span className="feed-row__date">{relativeDate(i.at)}</span>
                  {i.editedAt && <Tag variant="neutral">Editada</Tag>}
                </div>
                {i.note && <p className="feed-row__note">{i.note}</p>}
              </button>
            ))}
            {feed.status === "CanLoadMore" && (
              <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => feed.loadMore(20)}>Ver más</button>
            )}
          </>
        ) : (
          <>
            {followUps.results.map((f) => (
              <button key={f._id} className="feed-row" onClick={() => router.push(`/prospectos/${f.prospectId}`)}>
                <div className="feed-row__head">
                  <span className="list-row__title">{f.prospectName ?? "Prospecto"}</span>
                  {f.status === "completado" ? (
                    <Tag variant={RESOLUTION_TAG_VARIANT[f.resolution] ?? "neutral"}>{RESOLUTION_LABELS[f.resolution] ?? "Completado"}</Tag>
                  ) : f.vencido ? (
                    <Tag variant="risk">Vencido</Tag>
                  ) : (
                    <Tag variant="neutral">Pendiente</Tag>
                  )}
                </div>
                <div className="feed-row__meta">
                  <span className="feed-row__type"><Tag icon={CONTACT_TYPE_ICONS[f.type]}>{CONTACT_TYPE_LABELS[f.type] ?? f.type}</Tag></span>
                  <span className="feed-row__date">{new Date(f.at).toLocaleDateString("es-MX")}</span>
                  {f.completedByName && <span className="feed-row__author">{f.completedByName}</span>}
                </div>
              </button>
            ))}
            {followUps.status === "CanLoadMore" && (
              <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => followUps.loadMore(20)}>Ver más</button>
            )}
          </>
        )}
      </div>
    </>
  );
}
