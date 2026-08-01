"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { useSession } from "@/lib/session.js";
import { CHANNELS, sortedInteractions, contactTypeLabel, relativeFollowUpLabel } from "@/lib/prospects.js";
import StageChangePicker from "@/components/StageChangePicker.js";
import "./ficha.css";

const CHANNEL_LABEL_BY_VALUE = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));
const CONTACT_ICON = { llamada: "phone", whatsapp: "message-circle", visita: "map-pin", email: "mail", otro: "circle" };

export default function FichaProspecto() {
  const { id } = useParams();
  const router = useRouter();
  const session = useSession();
  const prospect = useQuery(api.prospects.get, { id });
  const updateProspect = useMutation(api.prospects.update);
  const canEdit = session?.role === "vendedor";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [changingStage, setChangingStage] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (prospect === undefined) return null;

  if (prospect === null) {
    return (
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="arrow-left" outline label="Volver" onClick={() => router.push("/prospectos")} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Prospecto no encontrado</p>
        </div>
      </div>
    );
  }

  function startEdit() {
    setDraft({ name: prospect.name, phone: prospect.phone, channel: prospect.channel, interest: prospect.interest, note: prospect.note });
    setError("");
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await updateProspect({ actorId: session.id, id: prospect._id, ...draft });
      setEditing(false);
    } catch (err) {
      setError(err.message ?? "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="arrow-left" outline label="Volver" onClick={() => router.push("/prospectos")} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Ficha del prospecto</p>
        </div>
        {canEdit && !editing && <IconButton icon="pencil" label="Editar" onClick={startEdit} />}
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="id-card" style={{ gap: 10 }}>
          <div className="field-group">
            <label className="field-label" htmlFor="fp-nombre">Nombre</label>
            <label className="mn-input mn-input--field">
              <input id="fp-nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="fp-tel">Teléfono</label>
            <label className="mn-input mn-input--field">
              <input id="fp-tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} required
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
            </label>
          </div>
          <div className="field-group">
            <span className="field-label">Canal de entrada</span>
            <div className="chip-row">
              {CHANNELS.map((c) => (
                <button type="button" key={c.value} className={`chip${draft.channel === c.value ? " selected" : ""}`}
                  onClick={() => setDraft({ ...draft, channel: c.value })}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="fp-interes">¿Qué le interesa?</label>
            <label className="mn-input mn-input--field">
              <input id="fp-interes" value={draft.interest} onChange={(e) => setDraft({ ...draft, interest: e.target.value })}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="fp-nota">Nota</label>
            <textarea id="fp-nota" className="mn-field-text" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </div>
          {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="secondary" full disabled={submitting} onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" full disabled={submitting}>{submitting ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      ) : (
        <div className="id-card">
          <div className="id-card__head">
            <div>
              <p className="id-card__name">{prospect.name}</p>
              <p className="id-card__biz">{prospect.interest || "Sin interés registrado"}</p>
            </div>
          </div>
          <div className="id-row"><Icon name="phone" size={16} />{prospect.phone}</div>
          <div className="id-row"><Icon name="message-circle" size={16} />Llegó por {CHANNEL_LABEL_BY_VALUE[prospect.channel] ?? prospect.channel}</div>
        </div>
      )}

      {changingStage ? (
        <StageChangePicker
          prospect={prospect}
          onChanged={() => setChangingStage(false)}
          onCancel={() => setChangingStage(false)}
        />
      ) : (
        <div className="stage-row">
          <div>
            <p className="stage-row__label">Etapa actual</p>
            <Badge stage={prospect.stage} />
          </div>
          {canEdit && (
            <button
              className="mn-button mn-button--ghost"
              style={{ height: 36, padding: "0 10px", fontSize: 12.5 }}
              onClick={() => setChangingStage(true)}
            >
              Cambiar
            </button>
          )}
        </div>
      )}

      <div className="next-follow">
        <span style={{ color: "var(--color-accent-pressed)", display: "inline-flex" }}>
          <Icon name="calendar-clock" size={18} />
        </span>
        <span className="next-follow__txt">
          {prospect.nextFollowUp ? (
            <>Próximo seguimiento: <b>{relativeFollowUpLabel(prospect.nextFollowUp.at)} · {contactTypeLabel(prospect.nextFollowUp.type)}</b></>
          ) : (
            <>Sin seguimiento programado</>
          )}
        </span>
      </div>

      <p className="section-label">Historial de interacciones</p>
      {sortedInteractions(prospect.interactions).length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--color-mute)" }}>Todavía no hay interacciones registradas.</p>
      ) : (
        <div className="id-card" style={{ padding: "4px 16px" }}>
          {sortedInteractions(prospect.interactions).map((item) => (
            <div className="history-item" key={item._id}>
              <div className="history-item__icon"><Icon name={CONTACT_ICON[item.type] ?? "circle"} size={16} /></div>
              <div>
                <p className="history-item__date">
                  {new Date(item.at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} · {contactTypeLabel(item.type)}
                </p>
                <p className="history-item__note">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="action-row">
          <Button variant="primary" onClick={() => router.push(`/prospectos/${prospect._id}/interaccion`)}>Registrar interacción</Button>
        </div>
      )}
    </>
  );
}
