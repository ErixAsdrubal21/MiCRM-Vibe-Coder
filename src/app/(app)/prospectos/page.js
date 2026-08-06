"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { Icon } from "@/design/components/core/Icon.jsx";
import { Badge } from "@/design/components/core/Badge.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { contactMetaLabel, daysSinceContact, isActiveStage, STAGES } from "@/lib/prospects.js";

const STAGE_LABELS = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cotizacion: "Cotización",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

/** Filtro "En riesgo" — misma condición que el Tag de riesgo (ICS-20). ?risk=1 lo preselecciona (ICS-24, link desde el dashboard de Marta). */
function isAtRisk(p) {
  return isActiveStage(p.stage) && daysSinceContact(p) > 3;
}

export default function ProspectosList() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState(() => (searchParams.get("risk") === "1" ? "riesgo" : "todas"));
  const router = useRouter();
  const prospectsData = useQuery(api.prospects.list);

  const filtered = useMemo(() => {
    const prospects = prospectsData ?? [];
    const q = query.trim().toLowerCase();
    return prospects.filter((p) => {
      const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""));
      const matchesStage = stageFilter === "todas" || (stageFilter === "riesgo" ? isAtRisk(p) : p.stage === stageFilter);
      return matchesQuery && matchesStage;
    });
  }, [prospectsData, query, stageFilter]);

  return (
    <>
      <TopBar title="Prospectos" />

      <div className="search-row">
        <label className="mn-input">
          <Icon name="search" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
          />
        </label>
      </div>

      <div className="chip-row chip-row--scroll">
        <button
          className={`chip chip--filter${stageFilter === "todas" ? " selected" : ""}`}
          onClick={() => setStageFilter("todas")}
        >
          Todas
        </button>
        <button
          className={`chip chip--filter${stageFilter === "riesgo" ? " selected" : ""}`}
          onClick={() => setStageFilter("riesgo")}
        >
          En riesgo
        </button>
        {STAGES.map((stage) => (
          <button
            key={stage}
            className={`chip chip--filter${stageFilter === stage ? " selected" : ""}`}
            onClick={() => setStageFilter(stage)}
          >
            {STAGE_LABELS[stage]}
          </button>
        ))}
      </div>

      {filtered.map((p) => (
        <button
          key={p._id}
          className="list-row"
          style={{ border: "none", width: "100%", cursor: "pointer", textAlign: "left" }}
          onClick={() => router.push(`/prospectos/${p._id}`)}
        >
          <div>
            <p className="list-row__title">{p.name}</p>
            {isAtRisk(p) ? (
              <Tag variant="risk" icon="alert-triangle">{contactMetaLabel(p)}</Tag>
            ) : (
              <p className="list-row__meta">{contactMetaLabel(p)}</p>
            )}
          </div>
          <Badge stage={p.stage} />
        </button>
      ))}

      {filtered.length === 0 && (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          Sin resultados{query && ` para "${query}"`}.
        </p>
      )}
    </>
  );
}
