"use client";

import { Badge } from "./Badge.jsx";
import { Tag } from "./Tag.jsx";
import { PriorityFlag } from "./PriorityFlag.jsx";
import { Button } from "./Button.jsx";

/**
 * ProspectCard — la unidad de referencia de la app de Carlos. Nombre,
 * negocio, etapa, prioridad opcional, riesgo opcional, y las dos acciones
 * de contacto en pastilla ancho-completo dentro de la misma tarjeta —
 * Carlos actúa sin salir de la lista de tareas del día.
 */
export function ProspectCard({
  name,
  business,
  stage,
  priority,
  daysSinceContact,
  onWhatsApp,
  onCall,
}) {
  const atRisk = typeof daysSinceContact === "number" && daysSinceContact > 3;

  return (
    <article className="mn-prospect-card">
      <div className="mn-prospect-card__top">
        <div>
          <p className="mn-prospect-card__name">{name}</p>
          <p className="mn-prospect-card__biz">{business}</p>
        </div>
        <Badge stage={stage} />
      </div>

      <div className="mn-prospect-card__meta">
        {atRisk ? (
          <Tag variant="risk" icon="alert-triangle">{`Sin contacto hace ${daysSinceContact} días`}</Tag>
        ) : (
          <span className="mn-prospect-card__meta-text">
            {daysSinceContact === 0 ? "Contactar hoy" : `Hace ${daysSinceContact} día${daysSinceContact === 1 ? "" : "s"}`}
          </span>
        )}
        {priority && <PriorityFlag level={priority} inline />}
      </div>

      <div className="mn-prospect-card__actions">
        <Button variant="primary" onClick={onWhatsApp}>WhatsApp</Button>
        <Button variant="secondary" onClick={onCall}>Llamar</Button>
      </div>
    </article>
  );
}