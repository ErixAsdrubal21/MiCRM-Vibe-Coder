"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/design/components/core/Button.jsx";
import { STAGES, STAGE_LABELS, LOSS_REASONS } from "@/lib/prospects.js";

/**
 * Selector de etapa compartido por Ficha (ICS-12) y Pipeline (ICS-14).
 * Mover a "Perdido" exige motivo (ICS-17) antes de confirmar. Mover a
 * "Ganado" exige monto + producto (ICS-21) antes de confirmar.
 * `onChanged` no recibe el prospecto actualizado (a diferencia del mock):
 * useQuery ya refleja el cambio automáticamente vía reactividad de Convex.
 */
export default function StageChangePicker({ prospect, onChanged, onCancel }) {
  const changeStage = useMutation(api.prospects.changeStage);
  const [pendingStage, setPendingStage] = useState(null);
  const [lossReason, setLossReason] = useState("");
  const [amount, setAmount] = useState("");
  const [product, setProduct] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function pick(stage) {
    setError("");
    if (stage === "perdido" || stage === "ganado") {
      setPendingStage(stage);
      return;
    }
    setSubmitting(true);
    try {
      await changeStage({ id: prospect._id, stage });
      onChanged();
    } catch (e) {
      setError(e.message ?? "No se pudo cambiar la etapa.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmLoss() {
    if (!lossReason) {
      setError("Selecciona un motivo antes de continuar.");
      return;
    }
    setSubmitting(true);
    try {
      await changeStage({ id: prospect._id, stage: "perdido", lossReason });
      onChanged();
    } catch (e) {
      setError(e.message ?? "No se pudo cambiar la etapa.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmWin() {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError("Ingresa un monto válido antes de continuar.");
      return;
    }
    if (!product.trim()) {
      setError("Ingresa el producto o servicio vendido.");
      return;
    }
    setSubmitting(true);
    try {
      await changeStage({ id: prospect._id, stage: "ganado", amount: amountNum, product: product.trim() });
      onChanged();
    } catch (e) {
      setError(e.message ?? "No se pudo cambiar la etapa.");
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingStage === "ganado") {
    return (
      <div className="id-card" style={{ gap: 10 }}>
        <p className="field-label">Registrar venta</p>
        <div className="field-group">
          <label className="field-label" htmlFor="scp-monto">Monto</label>
          <label className="mn-input mn-input--field">
            <input
              id="scp-monto"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(""); }}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="scp-producto">Producto o servicio</label>
          <label className="mn-input mn-input--field">
            <input
              id="scp-producto"
              type="text"
              value={product}
              onChange={(e) => { setProduct(e.target.value); setError(""); }}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>
        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" full disabled={submitting} onClick={() => { setPendingStage(null); setAmount(""); setProduct(""); onCancel?.(); }}>Cancelar</Button>
          <Button variant="primary" full disabled={submitting} onClick={confirmWin}>Marcar como ganado</Button>
        </div>
      </div>
    );
  }

  if (pendingStage === "perdido") {
    return (
      <div className="id-card" style={{ gap: 10 }}>
        <p className="field-label">Motivo de la pérdida</p>
        <div className="chip-row">
          {LOSS_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`chip${lossReason === r.value ? " selected" : ""}`}
              onClick={() => { setLossReason(r.value); setError(""); }}
            >
              {r.label}
            </button>
          ))}
        </div>
        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" full disabled={submitting} onClick={() => { setPendingStage(null); setLossReason(""); onCancel?.(); }}>Cancelar</Button>
          <Button variant="danger" full disabled={submitting} onClick={confirmLoss}>Marcar como perdido</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="id-card" style={{ gap: 10 }}>
      <p className="field-label">Mover a</p>
      <div className="chip-row">
        {STAGES.filter((s) => s !== prospect.stage).map((s) => (
          <button key={s} type="button" className="chip" disabled={submitting} onClick={() => pick(s)}>
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>
      {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
      <Button variant="ghost" full disabled={submitting} onClick={onCancel}>Cancelar</Button>
    </div>
  );
}
