"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/design/components/core/Button.jsx";
import { PeriodToggle } from "@/design/components/core/PeriodToggle.jsx";
import { errorMessage } from "@/lib/errors.js";
import { isSafeLink } from "../../shared/webResearch.js";
import "./webResearch.css";

const TABS = [
  { value: "perfil", label: "Perfil" },
  { value: "noticias", label: "Noticias" },
];

const EMPTY_TEXT = {
  perfil: "Exa no encontró páginas sobre esta empresa.",
  noticias: "No hay noticias de esta empresa en los últimos 90 días.",
};

function formatDay(isoOrMs) {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(`${isoOrMs}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Lista de resultados de Exa, compartida con /prospectos/buscar. */
export function WebResultList({ results, renderAction }) {
  return (
    <div className="web-results">
      {results.filter((r) => isSafeLink(r.url)).map((r) => (
        <div key={r.url} className="web-result">
          <a className="web-result__title" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
          <p className="web-result__meta">
            {r.source}
            {r.publishedDate && ` · ${formatDay(r.publishedDate)}`}
          </p>
          {r.snippet && <p className="web-result__snippet">{r.snippet}</p>}
          {renderAction && <div className="web-result__actions">{renderAction(r)}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * ICS-139/140 — sección "En la web" de la ficha: perfil y noticias de la
 * empresa del prospecto, buscados con Exa. Lo guardado se muestra sin costo;
 * "Buscar"/"Actualizar" sí consume una búsqueda del tope diario.
 */
export default function WebResearchSection({ prospectId, canEdit, onAddCompany }) {
  const data = useQuery(api.webResearch.byProspect, { prospectId });
  const usage = useQuery(api.webResearch.myUsage);
  const research = useAction(api.exa.researchProspect);
  const [tab, setTab] = useState("perfil");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (data === undefined) return null;

  const current = data[tab];
  const outOfQuota = usage && usage.remaining === 0;

  async function search(force) {
    setBusy(true);
    setError("");
    try {
      await research({ prospectId, kind: tab, force });
    } catch (err) {
      setError(errorMessage(err, "No se pudo completar la búsqueda web."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="section-label">En la web</p>
      <div className="web-card">
        {!data.canSearch ? (
          <>
            <p className="web-card__hint">
              Agrega la empresa o el sitio web del prospecto para buscar su información y noticias en la web. Solo se buscan esos datos, nunca el nombre ni el teléfono.
            </p>
            {canEdit && (
              <div>
                <Button variant="secondary" onClick={onAddCompany}>Agregar empresa o web</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="web-card__head">
              <PeriodToggle value={tab} onChange={(t) => { setTab(t); setError(""); }} options={TABS} />
              {current && (
                <Button variant="ghost" style={{ height: 36, padding: "0 10px", fontSize: 12.5 }} disabled={busy || outOfQuota} onClick={() => search(true)}>
                  {busy ? "Buscando..." : "Actualizar"}
                </Button>
              )}
            </div>

            {current ? (
              <>
                {current.results.length === 0 ? (
                  <p className="web-card__hint">{EMPTY_TEXT[tab]}</p>
                ) : (
                  <WebResultList results={current.results} />
                )}
                <p className="web-footnote">
                  Buscado el {formatDay(current.fetchedAt)}{current.stale && " · puede estar desactualizado"}
                </p>
              </>
            ) : (
              <>
                <p className="web-card__hint">
                  {tab === "perfil"
                    ? "Busca la página y la información pública de la empresa."
                    : "Busca noticias de la empresa de los últimos 90 días."}
                </p>
                <div>
                  <Button variant="secondary" disabled={busy || outOfQuota} onClick={() => search(false)}>
                    {busy ? "Buscando..." : tab === "perfil" ? "Buscar en la web" : "Buscar noticias"}
                  </Button>
                </div>
              </>
            )}

            {error && <p className="web-card__error">{error}</p>}
            {usage && (
              <p className="web-footnote">
                {outOfQuota
                  ? `Usaste tus ${usage.limit} búsquedas de las últimas 24 horas.`
                  : `Te quedan ${usage.remaining} de ${usage.limit} búsquedas en 24 horas.`}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
