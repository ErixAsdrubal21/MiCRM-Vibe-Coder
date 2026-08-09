"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { isActiveStage, CONTACT_TYPES, FOLLOW_UP_TYPES } from "@/lib/prospects.js";
import "./interaccion.css";

function defaultFollowUpDate(prospect) {
  const d = new Date();
  d.setDate(d.getDate() + (prospect.stage === "cotizacion" ? 2 : 1));
  return d.toISOString().slice(0, 10);
}

export default function RegistrarInteraccion() {
  const { id } = useParams();
  const router = useRouter();
  const prospect = useQuery(api.prospects.get, { id });
  const addInteraction = useMutation(api.interactions.add);

  const [type, setType] = useState("whatsapp");
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpType, setFollowUpType] = useState("whatsapp");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (prospect === undefined) return null;

  if (prospect === null) {
    return (
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={() => router.push("/prospectos")} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Prospecto no encontrado</p>
        </div>
      </div>
    );
  }

  // Valor derivado en vez de sincronizado por efecto: mientras el usuario no
  // toque el campo, se muestra la fecha sugerida según la etapa; en cuanto
  // escribe algo, `followUpDate` deja de estar vacío y ese valor manda.
  const followUpDateValue = followUpDate || defaultFollowUpDate(prospect);
  const followUpRequired = isActiveStage(prospect.stage);

  async function handleSubmit(e) {
    e.preventDefault();
    if (followUpRequired && !followUpDateValue) {
      setError("Todo prospecto activo necesita una fecha de próximo seguimiento.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await addInteraction({
        prospectId: prospect._id,
        type,
        note,
        nextFollowUp: followUpDateValue ? { at: new Date(followUpDateValue).getTime(), type: followUpType } : undefined,
      });
      router.replace(`/prospectos/${prospect._id}`);
    } catch (err) {
      setError(err.message ?? "No se pudo registrar la interacción.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Registrar interacción</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="top-bar__sub" style={{ margin: 0 }}>{prospect.name} · {prospect.interest || "Sin interés registrado"}</p>

        <div className="field-group">
          <span className="field-label">Tipo de contacto</span>
          <div className="contact-type-row">
            {CONTACT_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                className={`contact-type-chip${type === t.value ? " selected" : ""}`}
                onClick={() => setType(t.value)}
              >
                <Icon name={t.icon} size={18} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="ri-nota">¿Qué pasó?</label>
          <textarea
            id="ri-nota"
            className="mn-field-text"
            placeholder="Ej. Le gustó el precio, pidió una semana para decidir..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="next-follow-card">
          <p className="next-follow-card__title">
            Próximo seguimiento{followUpRequired && " *"}
          </p>
          <div className="field-group">
            <label className="mn-input mn-input--field">
              <input
                type="date"
                value={followUpDateValue}
                onChange={(e) => setFollowUpDate(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>
          <div className="contact-type-row">
            {FOLLOW_UP_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                className={`contact-type-chip${followUpType === t.value ? " selected" : ""}`}
                onClick={() => setFollowUpType(t.value)}
              >
                <Icon name={t.icon} size={18} />
                {t.label}
              </button>
            ))}
          </div>
          {followUpRequired && (
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--color-mute)", margin: 0 }}>
              Todo prospecto activo necesita una fecha de próximo seguimiento.
            </p>
          )}
        </div>

        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}

        <Button type="submit" variant="primary" full disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar y programar"}
        </Button>
      </form>
    </>
  );
}
