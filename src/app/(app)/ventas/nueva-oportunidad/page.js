"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { useSession, homePathForRole } from "@/lib/session.js";
import { todayISO } from "@/lib/dates.js";

const STAGE_CHIPS = [
  { value: "calificacion", label: "Calificación" },
  { value: "cotizacion", label: "Cotización" },
  { value: "negociacion", label: "Negociación" },
];

/** ICS-103 — "Nueva oportunidad": mismo patrón de selector de cliente que "Nueva tarea" (ICS-92). */
export default function NuevaOportunidad() {
  const router = useRouter();
  const session = useSession();
  const prospectsData = useQuery(api.prospects.listMine, session?.role === "vendedor" ? {} : "skip");
  const createOpportunity = useMutation(api.opportunities.create);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState("");
  const [product, setProduct] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [stage, setStage] = useState("calificacion");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const candidates = useMemo(() => {
    const all = prospectsData ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q));
  }, [prospectsData, query]);

  if (session === undefined) return null;
  if (session === null || session.role !== "vendedor") {
    if (session) router.replace(homePathForRole(session.role));
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const amountNum = Number(estimatedAmount);
    if (!name.trim()) return setError("Ponle un nombre a la oportunidad.");
    if (!product.trim()) return setError("Indica el producto o servicio.");
    if (!amountNum || amountNum <= 0) return setError("Ingresa un monto estimado válido.");
    setSubmitting(true);
    try {
      await createOpportunity({
        prospectId: selected._id,
        name: name.trim(),
        product: product.trim(),
        estimatedAmount: amountNum,
        stage,
        expectedCloseDate: expectedCloseDate || undefined,
      });
      router.replace(`/prospectos/${selected._id}`);
    } catch (err) {
      setError(err.message ?? "No se pudo crear la oportunidad.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Nueva oportunidad</p>
        </div>
      </div>

      {!selected ? (
        <>
          <div className="search-row">
            <label className="mn-input">
              <Icon name="search" size={18} />
              <input
                type="text"
                placeholder="Buscar cliente por nombre"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
                autoFocus
              />
            </label>
          </div>

          {prospectsData === undefined ? null : candidates.length === 0 ? (
            <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
              Sin clientes{query && ` para "${query}"`}.
            </p>
          ) : (
            candidates.map((p) => (
              <button
                key={p._id}
                className="list-row"
                style={{ border: "none", width: "100%", cursor: "pointer", textAlign: "left" }}
                onClick={() => setSelected(p)}
              >
                <p className="list-row__title">{p.name}</p>
                <Badge stage={p.stage} />
              </button>
            ))
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="next-follow-card">
            <p className="next-follow-card__title">Cliente</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p className="list-row__title" style={{ margin: 0 }}>{selected.name}</p>
              <button
                type="button"
                className="mn-button mn-button--ghost"
                style={{ height: 32, padding: "0 10px", fontSize: 12.5 }}
                onClick={() => setSelected(null)}
              >
                Cambiar
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="no-nombre">Nombre de la oportunidad</label>
            <label className="mn-input mn-input--field">
              <input
                id="no-nombre"
                type="text"
                placeholder="Ej. Cotización tinacos 1100L"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="no-producto">Producto o servicio</label>
            <label className="mn-input mn-input--field">
              <input
                id="no-producto"
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="no-monto">Monto estimado</label>
            <label className="mn-input mn-input--field">
              <input
                id="no-monto"
                type="number"
                min="0"
                step="0.01"
                value={estimatedAmount}
                onChange={(e) => setEstimatedAmount(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          <div className="field-group">
            <span className="field-label">Etapa inicial</span>
            <div className="chip-row">
              {STAGE_CHIPS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  className={`chip${stage === c.value ? " selected" : ""}`}
                  onClick={() => setStage(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="no-fecha">Fecha esperada de cierre (opcional)</label>
            <label className="mn-input mn-input--field">
              <input
                id="no-fecha"
                type="date"
                min={todayISO()}
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}

          <Button type="submit" variant="primary" full disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar oportunidad"}
          </Button>
        </form>
      )}
    </>
  );
}
