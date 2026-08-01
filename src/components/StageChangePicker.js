"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/design/components/core/Button.jsx";
import { useSession } from "@/lib/session.js";
import { STAGES, STAGE_LABELS, LOSS_REASONS } from "@/lib/prospects.js";

/**
 * Selector de etapa compartido por Ficha (ICS-12) y Pipeline (ICS-14).
 * Mover a "Perdido" exige motivo (ICS-17) antes de confirmar. Mover a
 * "Ganado" no pide monto/producto todavía — eso es ICS-21, no construido.
 * `onChanged` no recibe el prospecto actualizado (a diferencia del mock):
 * useQuery ya refleja el cambio automáticamente vía reactividad de Convex.
 */
export default function StageChangePicker({ prospect, onChanged, onCancel }) {
  const session = useSession();
  const changeStage = useMutation(api.prospects.changeStage);
  const [pendingStage, setPendingStage] = useState(null);
  const [lossReason, setLossReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function pick(stage) {
    setError("");
    if (stage === "perdido") {
      setPendingStage("perdido");
      return;
    }
    setSubmitting(true);
    try {
      await changeStage({ actorId: session.id, id: prospect._id, stage });
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
      await changeStage({ actorId: session.id, id: prospect._id, stage: "perdido", lossReason });
      onChanged();
    } catch (e) {
      setError(e.message ?? "No se pudo cambiar la etapa.");
    } finally {
      setSubmitting(false);
    }
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
      {STAGES.filter((s) => s !== prospect.stage).some((s) => s === "ganado") && (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 11.5, color: "var(--color-mute)", margin: 0 }}>
          Marcar como Ganado no registra monto/producto todavía — eso llega en el Registro de venta cerrada (ICS-21).
        </p>
      )}
      <Button variant="ghost" full disabled={submitting} onClick={onCancel}>Cancelar</Button>
    </div>
  );
}
