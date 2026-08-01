"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Icon } from "@/design/components/core/Icon.jsx";
import { useSession } from "@/lib/session.js";
import { contactTypeLabel } from "@/lib/prospects.js";

const CONTACT_ICON = { llamada: "phone", whatsapp: "message-circle", visita: "map-pin", email: "mail", otro: "circle" };

export default function TareasDelDia() {
  const session = useSession();
  const router = useRouter();
  const todos = useQuery(api.followUps.today) ?? [];
  const completeFollowUp = useMutation(api.followUps.complete);
  const [completingId, setCompletingId] = useState(null);
  const [error, setError] = useState("");

  async function handleComplete(prospectId, e) {
    e.stopPropagation();
    setError("");
    setCompletingId(prospectId);
    try {
      await completeFollowUp({ actorId: session.id, prospectId });
    } catch (err) {
      setError(err.message ?? "No se pudo completar la tarea.");
    } finally {
      setCompletingId(null);
    }
  }

  if (!session) return null;

  return (
    <>
      <TopBar
        title={`Hola, ${session.name}`}
        sub={`${new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} · ${todos.length} pendiente${todos.length === 1 ? "" : "s"} hoy`}
      />

      {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)" }}>{error}</p>}

      {todos.length === 0 && (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          No tienes tareas pendientes hoy.
        </p>
      )}

      {todos.map(({ prospect, nextFollowUp, daysSinceContact, atRisk }) => (
        <div className="list-row" key={prospect._id} onClick={() => router.push(`/prospectos/${prospect._id}`)} style={{ cursor: "pointer" }}>
          <div>
            <p className="list-row__title">{prospect.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              {atRisk ? (
                <Tag variant="risk" icon="alert-triangle">{`Sin contacto hace ${daysSinceContact} días`}</Tag>
              ) : (
                <span className="list-row__meta">Contactar hoy</span>
              )}
              {nextFollowUp && (
                <span className="list-row__meta" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Icon name={CONTACT_ICON[nextFollowUp.type] ?? "circle"} size={12} />
                  {contactTypeLabel(nextFollowUp.type)}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge stage={prospect.stage} />
            {nextFollowUp && (
              <IconButton
                icon="check"
                label="Marcar como realizada"
                disabled={completingId === prospect._id}
                onClick={(e) => handleComplete(prospect._id, e)}
              />
            )}
          </div>
        </div>
      ))}
    </>
  );
}
