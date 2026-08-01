"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { Badge } from "@/design/components/core/Badge.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { useSession } from "@/lib/session.js";
import { STAGES, daysInStage } from "@/lib/prospects.js";
import StageChangePicker from "@/components/StageChangePicker.js";
import "./pipeline.css";

function isThisMonth(ms) {
  const d = new Date(ms);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function rowMeta(prospect) {
  const days = daysInStage(prospect);
  if (prospect.stage === "perdido") return prospect.lossReason ?? "sin especificar";
  if (prospect.stage === "ganado") {
    if (days === 0) return "hoy";
    if (days < 7) return `hace ${days} día${days === 1 ? "" : "s"}`;
    const weeks = Math.floor(days / 7);
    return `hace ${weeks} semana${weeks === 1 ? "" : "s"}`;
  }
  return `${days} día${days === 1 ? "" : "s"}`;
}

export default function Pipeline() {
  const session = useSession();
  const router = useRouter();
  const canEdit = session?.role === "vendedor";
  const [changingId, setChangingId] = useState(null);

  const prospects = useQuery(api.prospects.pipeline) ?? [];
  const groups = STAGES.map((stage) => {
    const items = prospects.filter((p) => p.stage === stage);
    const isClosed = stage === "ganado" || stage === "perdido";
    const count = isClosed ? items.filter((p) => isThisMonth(p.stageChangedAt)).length : items.length;
    return { stage, items, countLabel: isClosed ? `${count} este mes` : `${count} prospecto${count === 1 ? "" : "s"}` };
  });

  return (
    <>
      <TopBar title="Pipeline de ventas" />

      {groups.map((group) => (
        <div className="stage-block" key={group.stage}>
          <div className="stage-block__head">
            <div className="stage-block__head-left">
              <Badge stage={group.stage} />
              <span className="stage-block__count">{group.countLabel}</span>
            </div>
          </div>
          {group.items.length > 0 && (
            <div className="stage-block__rows">
              {group.items.map((p) =>
                changingId === p._id ? (
                  <div key={p._id} style={{ padding: "10px 14px" }}>
                    <StageChangePicker prospect={p} onChanged={() => setChangingId(null)} onCancel={() => setChangingId(null)} />
                  </div>
                ) : (
                  <div className="stage-block__row" key={p._id}>
                    <button className="stage-block__row-name" onClick={() => router.push(`/prospectos/${p._id}`)}>
                      {p.name}
                    </button>
                    <div className="stage-block__row-right">
                      <span className="stage-block__row-days">{rowMeta(p)}</span>
                      {canEdit && (
                        <IconButton icon="arrow-right-left" label={`Cambiar etapa de ${p.name}`} outline onClick={() => setChangingId(p._id)} />
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
