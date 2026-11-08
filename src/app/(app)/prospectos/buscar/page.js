"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Icon } from "@/design/components/core/Icon.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { WebResultList } from "@/components/WebResearchSection.js";
import { useSession } from "@/lib/session.js";
import { errorMessage } from "@/lib/errors.js";
import { PROSPECT_QUERY_MAX, PROSPECT_QUERY_MIN } from "../../../../../shared/webResearch.js";
import "@/components/webResearch.css";

/**
 * ICS-141 — buscar prospectos nuevos en la web con Exa. Se describe el tipo
 * de negocio y Exa devuelve empresas. El vendedor puede abrir "Nuevo
 * prospecto" con la empresa y la web ya llenas; la administradora solo
 * consulta (no crea prospectos). Los resultados no se guardan.
 */
export default function BuscarProspectos() {
  const router = useRouter();
  const session = useSession();
  const usage = useQuery(api.webResearch.myUsage);
  const findProspects = useAction(api.exa.findProspects);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canCreate = session?.role === "vendedor";
  const outOfQuota = usage && usage.remaining === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    const text = query.trim();
    if (text.length < PROSPECT_QUERY_MIN) {
      setError("Describe un poco más lo que buscas.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResults(await findProspects({ query: text }));
      setSearchedFor(text);
    } catch (err) {
      setError(errorMessage(err, "No se pudo completar la búsqueda web."));
    } finally {
      setBusy(false);
    }
  }

  function addAsProspect(result) {
    const params = new URLSearchParams({ empresa: result.title.slice(0, 120), web: new URL(result.url).origin });
    router.push(`/prospectos/nuevo?${params}`);
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="arrow-left" outline label="Volver" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Buscar prospectos en la web</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="field-group">
          <label className="field-label" htmlFor="bp-query">¿Qué tipo de negocio buscas?</label>
          <label className="mn-input mn-input--field">
            <Icon name="search" size={18} />
            <input
              id="bp-query"
              type="text"
              placeholder="Ej. restaurantes en Monterrey"
              value={query}
              maxLength={PROSPECT_QUERY_MAX}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>
        <Button type="submit" variant="primary" full disabled={busy || outOfQuota}>
          {busy ? "Buscando..." : "Buscar"}
        </Button>
        {error && <p className="web-card__error">{error}</p>}
        {usage && (
          <p className="web-footnote">
            {outOfQuota
              ? `Usaste tus ${usage.limit} búsquedas de las últimas 24 horas.`
              : `Cada búsqueda cuenta para tu tope: te quedan ${usage.remaining} de ${usage.limit} en 24 horas.`}
          </p>
        )}
      </form>

      {results && (
        <>
          <p className="section-label">Resultados para “{searchedFor}”</p>
          <div className="web-card">
            {results.length === 0 ? (
              <p className="web-card__hint">No se encontraron empresas. Prueba con otra descripción.</p>
            ) : (
              <WebResultList
                results={results}
                renderAction={canCreate ? (r) => (
                  <Button variant="secondary" onClick={() => addAsProspect(r)}>Agregar como prospecto</Button>
                ) : undefined}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
