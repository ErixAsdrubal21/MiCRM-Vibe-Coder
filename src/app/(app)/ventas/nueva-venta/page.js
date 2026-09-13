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

/**
 * ICS-103 — "Registrar venta directa": venta sin oportunidad previa
 * (`sales.createDirect`, ICS-101). Mismo patrón de selector de cliente que
 * "Nueva tarea"/"Nueva oportunidad".
 */
export default function NuevaVentaDirecta() {
  const router = useRouter();
  const session = useSession();
  const prospectsData = useQuery(api.prospects.listMine, session?.role === "vendedor" ? {} : "skip");
  const createDirect = useMutation(api.sales.createDirect);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [product, setProduct] = useState("");
  const [closedDate, setClosedDate] = useState("");
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
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) return setError("Ingresa un monto válido.");
    if (!product.trim()) return setError("Indica el producto o servicio vendido.");
    setSubmitting(true);
    try {
      await createDirect({
        prospectId: selected._id,
        amount: amountNum,
        product: product.trim(),
        closedDate: closedDate || undefined,
      });
      router.replace(`/prospectos/${selected._id}`);
    } catch (err) {
      setError(err.message ?? "No se pudo registrar la venta.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Registrar venta directa</p>
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
            <label className="field-label" htmlFor="nv-monto">Monto</label>
            <label className="mn-input mn-input--field">
              <input
                id="nv-monto"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="nv-producto">Producto o servicio</label>
            <label className="mn-input mn-input--field">
              <input
                id="nv-producto"
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="nv-fecha">Fecha de cierre</label>
            <label className="mn-input mn-input--field">
              <input
                id="nv-fecha"
                type="date"
                max={todayISO()}
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}

          <Button type="submit" variant="primary" full disabled={submitting}>
            {submitting ? "Guardando..." : "Registrar venta"}
          </Button>
        </form>
      )}
    </>
  );
}
