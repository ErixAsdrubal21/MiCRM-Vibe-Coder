"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { useSession } from "@/lib/session.js";
import { CHANNELS, CONTACT_TYPES, FOLLOW_UP_TYPES, CONTACT_ICON, STAGE_LABELS, LOSS_REASONS, contactTypeLabel, relativeFollowUpLabel } from "@/lib/prospects.js";
import { OUTCOME_VALUES, OUTCOME_LABELS, RESOLUTION_LABELS, OPPORTUNITY_OPEN_STAGES } from "../../../../../shared/crmEnums.js";
import { todayISO, plusDaysISO, isoToLocalMs } from "@/lib/dates.js";
import StageChangePicker from "@/components/StageChangePicker.js";
import "./ficha.css";

const CHANNEL_LABEL_BY_VALUE = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));
const OUTCOME_TAG_VARIANT = { positivo: "success", negativo: "risk", neutro: "neutral", "sin-respuesta": "neutral" };
const RESOLUTION_TAG_VARIANT = { hecho: "success", "no-contactado": "neutral", reprogramado: "neutral", cancelado: "risk" };

function money(n) {
  return `$${n.toLocaleString("es-MX")}`;
}

function formatEventDate(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}`;
}

function defaultFollowUpDate(prospect) {
  return plusDaysISO(prospect.stage === "cotizacion" ? 2 : 1);
}

export default function FichaProspecto() {
  const { id } = useParams();
  const router = useRouter();
  const session = useSession();
  const prospect = useQuery(api.prospects.get, { id });
  const timeline = usePaginatedQuery(api.timeline.listByProspect, { prospectId: id }, { initialNumItems: 15 });
  const opportunities = usePaginatedQuery(api.opportunities.listByProspect, { prospectId: id }, { initialNumItems: 5 });
  const sales = usePaginatedQuery(api.sales.listByProspect, { prospectId: id }, { initialNumItems: 5 });
  const updateProspect = useMutation(api.prospects.update);
  const editInteraction = useMutation(api.interactions.edit);
  const removeInteraction = useMutation(api.interactions.remove);
  const completeFollowUp = useMutation(api.followUps.complete);
  const updateOpportunity = useMutation(api.opportunities.update);
  const winOpportunity = useMutation(api.opportunities.win);
  const markOpportunityLost = useMutation(api.opportunities.markLost);
  const canEdit = session?.role === "vendedor";

  // ICS-104 (B3): "venta anulada" en una oportunidad ganada se deriva de
  // opportunity.saleId -> sale.voidedAt, sin campo nuevo — join en lectura
  // sobre lo ya cargado para el bloque "Ventas" de esta misma ficha (ambos
  // bloques comparten página; una venta anulada fuera de esa primera
  // ventana de "Ver más" simplemente no se refleja aquí todavía).
  const saleById = new Map(sales.results.map((s) => [s._id, s]));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [changingStage, setChangingStage] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Historial: edición/borrado de una interacción propia.
  const [editingEventId, setEditingEventId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Seguimiento pendiente: marcar hecho / reprogramar.
  const [reprogramming, setReprogramming] = useState(false);
  const [reprogramDate, setReprogramDate] = useState("");
  const [reprogramType, setReprogramType] = useState("llamada");
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpError, setFollowUpError] = useState("");

  // Oportunidades (ICS-104): a lo más una fila con un panel de acción
  // abierto; oppDraft se siembra al abrir el panel (mismo patrón que
  // editDraft para interacciones) para no depender de props que pueden
  // quedar obsoletas mientras el panel sigue abierto.
  const [oppAction, setOppAction] = useState(null); // { id, kind: "editar"|"ganar"|"perdida" }
  const [oppDraft, setOppDraft] = useState(null);
  const [oppBusy, setOppBusy] = useState(false);
  const [oppError, setOppError] = useState("");

  function startOppAction(opportunity, kind) {
    setOppError("");
    setOppAction({ id: opportunity._id, kind });
    if (kind === "editar") {
      setOppDraft({
        name: opportunity.name,
        product: opportunity.product,
        estimatedAmount: opportunity.estimatedAmount ?? "",
        expectedCloseDate: opportunity.expectedCloseDate ?? "",
      });
    } else if (kind === "ganar") {
      setOppDraft({ amount: opportunity.estimatedAmount ?? "", closedDate: todayISO() });
    } else if (kind === "perdida") {
      setOppDraft({ lossReason: "" });
    }
  }

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
      await updateProspect({ id: prospect._id, ...draft });
      setEditing(false);
    } catch (err) {
      setError(err.message ?? "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditEvent(event) {
    setConfirmingDeleteId(null);
    setEditingEventId(event._id);
    setEditDraft({ note: event.interaction.note, type: event.interaction.contactType, outcome: event.interaction.outcome ?? "" });
    setEditError("");
  }

  async function submitEditEvent(e, interactionId) {
    e.preventDefault();
    setEditBusy(true);
    setEditError("");
    try {
      await editInteraction({
        id: interactionId,
        note: editDraft.note,
        type: editDraft.type,
        outcome: editDraft.outcome || undefined,
      });
      setEditingEventId(null);
    } catch (err) {
      setEditError(err.message ?? "No se pudo guardar.");
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete(interactionId) {
    setDeleteBusy(true);
    try {
      await removeInteraction({ id: interactionId });
      setConfirmingDeleteId(null);
    } catch (err) {
      setEditError(err.message ?? "No se pudo eliminar.");
      setConfirmingDeleteId(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleMarkDone() {
    setFollowUpBusy(true);
    setFollowUpError("");
    try {
      await completeFollowUp({ id: prospect.nextFollowUp._id, resolution: "hecho" });
    } catch (err) {
      setFollowUpError(err.message ?? "No se pudo completar el seguimiento.");
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function submitReprogram(e) {
    e.preventDefault();
    setFollowUpBusy(true);
    setFollowUpError("");
    try {
      const dateValue = reprogramDate || defaultFollowUpDate(prospect);
      await completeFollowUp({
        id: prospect.nextFollowUp._id,
        resolution: "reprogramado",
        nextFollowUp: { at: isoToLocalMs(dateValue), type: reprogramType },
      });
      setReprogramming(false);
      setReprogramDate("");
    } catch (err) {
      setFollowUpError(err.message ?? "No se pudo reprogramar.");
    } finally {
      setFollowUpBusy(false);
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

      {/* ICS-104: el bloque "Vendido: $X" atado a stage==="ganado" se quitó —
          ese campo ya no existe (ICS-101 B5); el detalle de venta vive ahora
          en el bloque "Ventas" de abajo, y una ganada no implica que este
          prospecto ya no tenga seguimiento (son conceptos independientes,
          ICS-98 B2). */}
      <div className="next-follow" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

          {canEdit && prospect.nextFollowUp && !reprogramming && (
            <div className="follow-actions">
              <Button variant="secondary" disabled={followUpBusy} onClick={handleMarkDone}>
                {followUpBusy ? "Guardando..." : "Marcar como hecho"}
              </Button>
              <Button variant="secondary" disabled={followUpBusy} onClick={() => { setReprogramming(true); setFollowUpError(""); }}>
                Reprogramar
              </Button>
            </div>
          )}

          {canEdit && prospect.nextFollowUp && reprogramming && (
            <form className="reprogram-form" onSubmit={submitReprogram}>
              <div className="field-group">
                <label className="mn-input mn-input--field">
                  <input
                    type="date"
                    min={todayISO()}
                    value={reprogramDate || defaultFollowUpDate(prospect)}
                    onChange={(e) => setReprogramDate(e.target.value)}
                    style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
                  />
                </label>
              </div>
              <div className="contact-type-row">
                {FOLLOW_UP_TYPES.map((t) => (
                  <button type="button" key={t.value} className={`contact-type-chip${reprogramType === t.value ? " selected" : ""}`}
                    onClick={() => setReprogramType(t.value)}>
                    <Icon name={t.icon} size={18} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="button" variant="secondary" full disabled={followUpBusy} onClick={() => setReprogramming(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" full disabled={followUpBusy}>{followUpBusy ? "Guardando..." : "Reprogramar"}</Button>
              </div>
            </form>
          )}

          {followUpError && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: "8px 0 0" }}>{followUpError}</p>}
        </div>

      <p className="section-label">Oportunidades{prospect.openOpportunitiesCount > 0 && ` · ${money(prospect.openPipelineAmount)} en pipeline`}</p>
      {canEdit && (
        <Button
          variant="secondary"
          onClick={() => router.push(`/ventas/nueva-oportunidad?prospect=${prospect._id}`)}
        >
          + Nueva oportunidad
        </Button>
      )}
      {opportunities.results.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--color-mute)" }}>
          {opportunities.status === "LoadingFirstPage" ? "Cargando..." : "Sin oportunidades registradas."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opportunities.results.map((o) => (
            <OpportunityRow
              key={o._id}
              opportunity={o}
              canEdit={canEdit}
              voidedSale={o.saleId ? saleById.get(o.saleId) : null}
              action={oppAction?.id === o._id ? oppAction.kind : null}
              draft={oppDraft}
              onDraftChange={setOppDraft}
              busy={oppBusy}
              error={oppAction?.id === o._id ? oppError : ""}
              onStart={(kind) => startOppAction(o, kind)}
              onCancel={() => setOppAction(null)}
              onSubmitEdit={async (e) => {
                e.preventDefault();
                setOppBusy(true);
                setOppError("");
                try {
                  await updateOpportunity({
                    id: o._id,
                    name: oppDraft.name,
                    product: oppDraft.product,
                    estimatedAmount: Number(oppDraft.estimatedAmount),
                    expectedCloseDate: oppDraft.expectedCloseDate || undefined,
                  });
                  setOppAction(null);
                } catch (err) {
                  setOppError(err.message ?? "No se pudo guardar.");
                } finally {
                  setOppBusy(false);
                }
              }}
              onSubmitWin={async (e) => {
                e.preventDefault();
                setOppBusy(true);
                setOppError("");
                try {
                  await winOpportunity({ id: o._id, amount: Number(oppDraft.amount), closedDate: oppDraft.closedDate || undefined });
                  setOppAction(null);
                } catch (err) {
                  setOppError(err.message ?? "No se pudo registrar la venta.");
                } finally {
                  setOppBusy(false);
                }
              }}
              onSubmitLost={async () => {
                if (!oppDraft.lossReason) return setOppError("Selecciona un motivo antes de continuar.");
                setOppBusy(true);
                setOppError("");
                try {
                  await markOpportunityLost({ id: o._id, lossReason: oppDraft.lossReason });
                  setOppAction(null);
                } catch (err) {
                  setOppError(err.message ?? "No se pudo marcar como perdida.");
                } finally {
                  setOppBusy(false);
                }
              }}
            />
          ))}
        </div>
      )}
      {opportunities.status === "CanLoadMore" && (
        <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => opportunities.loadMore(5)}>
          Ver más
        </button>
      )}

      <p className="section-label">Ventas{prospect.salesCount > 0 && ` · ${money(prospect.salesTotalAmount)} en ${prospect.salesCount} venta${prospect.salesCount === 1 ? "" : "s"}`}</p>
      {canEdit && (
        <Button
          variant="secondary"
          onClick={() => router.push(`/ventas/nueva-venta?prospect=${prospect._id}`)}
        >
          + Registrar venta directa
        </Button>
      )}
      {sales.results.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--color-mute)" }}>
          {sales.status === "LoadingFirstPage" ? "Cargando..." : "Sin ventas registradas."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sales.results.map((s) => (
            <button
              key={s._id}
              className="list-row"
              style={{ border: "none", width: "100%", cursor: "pointer", textAlign: "left", opacity: s.voidedAt ? 0.6 : 1 }}
              onClick={() => router.push(`/ventas/${s._id}`)}
            >
              <div>
                <p className="list-row__title">{money(s.amount)} · {s.product}</p>
                <p className="list-row__meta">{new Date(s.closedAt).toLocaleDateString("es-MX")}</p>
              </div>
              {s.voidedAt && <Tag variant="risk">Venta anulada</Tag>}
            </button>
          ))}
        </div>
      )}
      {sales.status === "CanLoadMore" && (
        <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => sales.loadMore(5)}>
          Ver más
        </button>
      )}

      <p className="section-label">Historial de la relación</p>
      {timeline.results.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--color-mute)" }}>
          {timeline.status === "LoadingFirstPage" ? "Cargando..." : "Todavía no hay actividad registrada."}
        </p>
      ) : (
        <div className="timeline">
          {timeline.results.map((event) => (
            <TimelineEvent
              key={event._id}
              event={event}
              isMine={canEdit && event.actorId === session?.id}
              isEditing={editingEventId === event._id}
              editDraft={editDraft}
              onEditDraftChange={setEditDraft}
              editError={editingEventId === event._id ? editError : ""}
              editBusy={editBusy}
              onStartEdit={() => startEditEvent(event)}
              onCancelEdit={() => setEditingEventId(null)}
              onSubmitEdit={(e) => submitEditEvent(e, event.interaction._id)}
              isConfirmingDelete={confirmingDeleteId === event._id}
              onAskDelete={() => { setEditingEventId(null); setConfirmingDeleteId(event._id); }}
              onCancelDelete={() => setConfirmingDeleteId(null)}
              onConfirmDelete={() => confirmDelete(event.interaction._id)}
              deleteBusy={deleteBusy}
            />
          ))}
        </div>
      )}

      {timeline.status === "CanLoadMore" && (
        <button className="mn-button mn-button--ghost" style={{ width: "100%" }} onClick={() => timeline.loadMore(15)}>
          Ver más
        </button>
      )}

      {canEdit && (
        <div className="action-row">
          <Button variant="primary" onClick={() => router.push(`/prospectos/${prospect._id}/interaccion`)}>Registrar interacción</Button>
        </div>
      )}
    </>
  );
}

function TimelineEvent({
  event,
  isMine,
  isEditing,
  editDraft,
  onEditDraftChange,
  editError,
  editBusy,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  isConfirmingDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  deleteBusy,
}) {
  if (event.type === "interaccion") {
    if (isEditing) {
      return (
        <div className="tl-item">
          <div className="tl-item__icon tl-item__icon--accent"><Icon name={CONTACT_ICON[editDraft.type] ?? "circle"} size={16} /></div>
          <form className="tl-edit-form" onSubmit={onSubmitEdit}>
            <div className="contact-type-row">
              {CONTACT_TYPES.map((t) => (
                <button type="button" key={t.value} className={`contact-type-chip${editDraft.type === t.value ? " selected" : ""}`}
                  onClick={() => onEditDraftChange({ ...editDraft, type: t.value })}>
                  <Icon name={t.icon} size={18} />
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="mn-field-text"
              value={editDraft.note}
              onChange={(e) => onEditDraftChange({ ...editDraft, note: e.target.value })}
            />
            <div className="chip-row">
              <button type="button" className={`chip${editDraft.outcome === "" ? " selected" : ""}`} onClick={() => onEditDraftChange({ ...editDraft, outcome: "" })}>
                Sin resultado
              </button>
              {OUTCOME_VALUES.map((v) => (
                <button type="button" key={v} className={`chip${editDraft.outcome === v ? " selected" : ""}`} onClick={() => onEditDraftChange({ ...editDraft, outcome: v })}>
                  {OUTCOME_LABELS[v]}
                </button>
              ))}
            </div>
            {editError && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{editError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="button" variant="secondary" full disabled={editBusy} onClick={onCancelEdit}>Cancelar</Button>
              <Button type="submit" variant="primary" full disabled={editBusy}>{editBusy ? "Guardando..." : "Guardar"}</Button>
            </div>
          </form>
        </div>
      );
    }

    const { interaction } = event;
    return (
      <div className="tl-item">
        <div className="tl-item__icon tl-item__icon--accent"><Icon name={CONTACT_ICON[interaction.contactType] ?? "circle"} size={16} /></div>
        <div className="tl-item__body">
          {isConfirmingDelete ? (
            <div className="tl-confirm">
              <span>¿Eliminar esta interacción?</span>
              <Button variant="secondary" disabled={deleteBusy} onClick={onCancelDelete}>No</Button>
              <Button variant="primary" disabled={deleteBusy} onClick={onConfirmDelete}>{deleteBusy ? "Eliminando..." : "Sí, eliminar"}</Button>
            </div>
          ) : (
            <>
              <div className="tl-item__head">
                <p className="tl-item__title">{contactTypeLabel(interaction.contactType)}</p>
                <span className="tl-item__date">{formatEventDate(event.at)}</span>
              </div>
              <p className="tl-item__note">{interaction.note}</p>
              <div className="tl-item__meta">
                <span className="tl-item__author">{interaction.registeredByName ?? "—"}</span>
                {interaction.outcome && <Tag variant={OUTCOME_TAG_VARIANT[interaction.outcome] ?? "neutral"}>{OUTCOME_LABELS[interaction.outcome]}</Tag>}
                {interaction.editedAt && <Tag variant="neutral">Editada</Tag>}
              </div>
            </>
          )}
        </div>
        {isMine && !isConfirmingDelete && (
          <div className="tl-item__actions">
            <IconButton icon="pencil" label="Editar interacción" onClick={onStartEdit} />
            <IconButton icon="trash-2" label="Eliminar interacción" onClick={onAskDelete} />
          </div>
        )}
      </div>
    );
  }

  if (event.type === "cambio-etapa") {
    return (
      <div className="tl-item tl-item--muted">
        <div className="tl-item__icon"><Icon name="arrow-right" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">
              {event.stageChange.fromStage ? (
                <>De {STAGE_LABELS[event.stageChange.fromStage] ?? event.stageChange.fromStage} a {STAGE_LABELS[event.stageChange.toStage] ?? event.stageChange.toStage}</>
              ) : (
                <>Etapa: {STAGE_LABELS[event.stageChange.toStage] ?? event.stageChange.toStage}</>
              )}
            </p>
            <span className="tl-item__date">{formatEventDate(event.at)}</span>
          </div>
          <div className="tl-item__meta"><span className="tl-item__author">{event.actorName ?? "—"}</span></div>
        </div>
      </div>
    );
  }

  if (event.type === "cierre-seguimiento") {
    const closure = event.followUpClosure;
    return (
      <div className="tl-item tl-item--muted">
        <div className="tl-item__icon"><Icon name="check-circle" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">Seguimiento cerrado{closure ? `: ${RESOLUTION_LABELS[closure.resolution] ?? closure.resolution}` : ""}</p>
            <span className="tl-item__date">{formatEventDate(event.at)}</span>
          </div>
          {closure?.note && <p className="tl-item__note">{closure.note}</p>}
          {closure?.closureReason && <p className="tl-item__note">{closure.closureReason}</p>}
          <div className="tl-item__meta">
            <span className="tl-item__author">{closure?.completedByName ?? event.actorName ?? "—"}</span>
            {closure?.resolution && <Tag variant={RESOLUTION_TAG_VARIANT[closure.resolution] ?? "neutral"}>{RESOLUTION_LABELS[closure.resolution]}</Tag>}
          </div>
        </div>
      </div>
    );
  }

  if (event.type === "venta") {
    return (
      <div className="tl-item">
        <div className="tl-item__icon tl-item__icon--accent"><Icon name="dollar-sign" size={16} /></div>
        <div className="tl-item__body">
          <div className="tl-item__head">
            <p className="tl-item__title">
              {event.sale ? <>Venta registrada: ${event.sale.amount.toLocaleString("es-MX")} · {event.sale.product}</> : "Venta registrada"}
            </p>
            <span className="tl-item__date">{formatEventDate(event.at)}</span>
          </div>
          <div className="tl-item__meta"><span className="tl-item__author">{event.actorName ?? "—"}</span></div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * ICS-104 — una fila de oportunidad en la ficha. Abierta: nombre/producto/
 * monto (o "Monto pendiente")/etapa/fecha esperada + Editar/Ganar/Marcar
 * perdida (solo dueño). Cerrada: desenlace, y si es ganada con la venta
 * anulada, "Venta anulada" en vez de "Ganada" a secas (B3, derivado de
 * `voidedSale`, sin campo nuevo).
 */
function OpportunityRow({ opportunity: o, canEdit, voidedSale, action, draft, onDraftChange, busy, error, onStart, onCancel, onSubmitEdit, onSubmitWin, onSubmitLost }) {
  const isOpen = OPPORTUNITY_OPEN_STAGES.includes(o.stage);

  if (action === "editar") {
    return (
      <form className="id-card" style={{ gap: 10 }} onSubmit={onSubmitEdit}>
        <div className="field-group">
          <label className="field-label" htmlFor={`oe-nombre-${o._id}`}>Nombre</label>
          <label className="mn-input mn-input--field">
            <input id={`oe-nombre-${o._id}`} value={draft.name} onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`oe-producto-${o._id}`}>Producto</label>
          <label className="mn-input mn-input--field">
            <input id={`oe-producto-${o._id}`} value={draft.product} onChange={(e) => onDraftChange({ ...draft, product: e.target.value })}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`oe-monto-${o._id}`}>Monto estimado</label>
          <label className="mn-input mn-input--field">
            <input id={`oe-monto-${o._id}`} type="number" min="0" step="0.01" value={draft.estimatedAmount}
              onChange={(e) => onDraftChange({ ...draft, estimatedAmount: e.target.value })}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`oe-fecha-${o._id}`}>Fecha esperada</label>
          <label className="mn-input mn-input--field">
            <input id={`oe-fecha-${o._id}`} type="date" value={draft.expectedCloseDate}
              onChange={(e) => onDraftChange({ ...draft, expectedCloseDate: e.target.value })}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>
        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="button" variant="secondary" full disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="primary" full disabled={busy}>{busy ? "Guardando..." : "Guardar"}</Button>
        </div>
      </form>
    );
  }

  if (action === "ganar") {
    return (
      <form className="id-card" style={{ gap: 10 }} onSubmit={onSubmitWin}>
        <p className="field-label">Ganar oportunidad</p>
        <div className="field-group">
          <label className="field-label" htmlFor={`ow-monto-${o._id}`}>Monto final</label>
          <label className="mn-input mn-input--field">
            <input id={`ow-monto-${o._id}`} type="number" min="0" step="0.01" value={draft.amount}
              onChange={(e) => onDraftChange({ ...draft, amount: e.target.value })}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`ow-fecha-${o._id}`}>Fecha de cierre</label>
          <label className="mn-input mn-input--field">
            <input id={`ow-fecha-${o._id}`} type="date" max={todayISO()} value={draft.closedDate}
              onChange={(e) => onDraftChange({ ...draft, closedDate: e.target.value })}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }} />
          </label>
        </div>
        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="button" variant="secondary" full disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="primary" full disabled={busy}>{busy ? "Guardando..." : "Marcar como ganada"}</Button>
        </div>
      </form>
    );
  }

  if (action === "perdida") {
    return (
      <div className="id-card" style={{ gap: 10 }}>
        <p className="field-label">Motivo de la pérdida</p>
        <div className="chip-row">
          {LOSS_REASONS.map((r) => (
            <button key={r.value} type="button" className={`chip${draft.lossReason === r.value ? " selected" : ""}`}
              onClick={() => onDraftChange({ ...draft, lossReason: r.value })}>
              {r.label}
            </button>
          ))}
        </div>
        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" full disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" full disabled={busy} onClick={onSubmitLost}>{busy ? "Guardando..." : "Marcar como perdida"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <p className="list-row__title">{o.name}</p>
        <Badge stage={o.stage} />
      </div>
      <p className="list-row__meta">{o.product}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {o.estimatedAmount != null ? (
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 13.5, fontWeight: 700, color: "var(--color-ink)" }}>{money(o.estimatedAmount)}</span>
        ) : (
          <Tag variant="neutral">Monto pendiente</Tag>
        )}
        {o.stage === "ganada" && voidedSale?.voidedAt && <Tag variant="risk">Venta anulada</Tag>}
        {isOpen && o.expectedCloseDate && <span className="list-row__meta">Esperada: {o.expectedCloseDate}</span>}
      </div>
      {canEdit && isOpen && (
        <div className="follow-actions">
          <Button variant="secondary" onClick={() => onStart("editar")}>Editar</Button>
          <Button variant="secondary" onClick={() => onStart("ganar")}>Ganar</Button>
          <Button variant="secondary" onClick={() => onStart("perdida")}>Marcar perdida</Button>
        </div>
      )}
    </div>
  );
}
