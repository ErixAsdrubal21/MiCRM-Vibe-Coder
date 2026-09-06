"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { useSession, homePathForRole } from "@/lib/session.js";
import { isActiveStage, contactMetaLabel, daysSinceContact, FOLLOW_UP_TYPES } from "@/lib/prospects.js";
import { todayISO, plusDaysISO, isoToLocalMs } from "@/lib/dates.js";

/**
 * ICS-92: "Nueva tarea" desde /tareas — agenda un seguimiento eligiendo el
 * cliente aquí mismo, sin pasar por "Registrar interacción" (esa asume que
 * el contacto ya ocurrió; esta es para anticipar un contacto futuro).
 */
export default function NuevaTarea() {
  const router = useRouter();
  const session = useSession();
  const prospectsData = useQuery(api.prospects.listMine);
  const createFollowUp = useMutation(api.followUps.create);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [date, setDate] = useState("");
  const [type, setType] = useState("whatsapp");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session && session.role !== "vendedor") router.replace(homePathForRole(session.role));
  }, [session, router]);

  const candidates = useMemo(() => {
    const active = (prospectsData ?? []).filter((p) => isActiveStage(p.stage));
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [prospectsData, query]);

  if (!session || session.role !== "vendedor") return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createFollowUp({ prospectId: selected._id, at: isoToLocalMs(date || plusDaysISO(1)), type });
      router.replace(`/prospectos/${selected._id}`);
    } catch (err) {
      setError(err.message ?? "No se pudo programar el seguimiento.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Nueva tarea</p>
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
              Sin clientes activos{query && ` para "${query}"`}.
            </p>
          ) : (
            candidates.map((p) => (
              <button
                key={p._id}
                className="list-row"
                style={{ border: "none", width: "100%", cursor: "pointer", textAlign: "left" }}
                onClick={() => setSelected(p)}
              >
                <div>
                  <p className="list-row__title">{p.name}</p>
                  {isActiveStage(p.stage) && daysSinceContact(p) > 3 ? (
                    <Tag variant="risk" icon="alert-triangle">{contactMetaLabel(p)}</Tag>
                  ) : (
                    <p className="list-row__meta">{contactMetaLabel(p)}</p>
                  )}
                </div>
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
            <label className="field-label" htmlFor="nt-fecha">Fecha del seguimiento</label>
            <label className="mn-input mn-input--field">
              <input
                id="nt-fecha"
                type="date"
                min={todayISO()}
                value={date || plusDaysISO(1)}
                onChange={(e) => setDate(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
              />
            </label>
          </div>

          <div className="field-group">
            <span className="field-label">Tipo</span>
            <div className="contact-type-row">
              {FOLLOW_UP_TYPES.map((t) => (
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

          {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}

          <Button type="submit" variant="primary" full disabled={submitting}>
            {submitting ? "Guardando..." : "Programar seguimiento"}
          </Button>
        </form>
      )}
    </>
  );
}
