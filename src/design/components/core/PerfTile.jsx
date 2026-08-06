"use client";

import { Icon } from "./Icon.jsx";

/**
 * PerfTile — nuevo, Milestone 5. Número + etiqueta + delta con flecha de
 * color, usado por Mi desempeño (ICS-22, retocado para coincidir con su
 * mockup confirmado). `direction` es "up" | "down" | "flat".
 */
export function PerfTile({ value, label, delta, direction = "flat" }) {
  return (
    <div className="mn-perf-tile">
      <span className="mn-perf-tile__num">{value}</span>
      <span className="mn-perf-tile__label">{label}</span>
      {delta && (
        <span className={`mn-perf-tile__delta mn-perf-tile__delta--${direction}`}>
          {direction !== "flat" && <Icon name={direction === "up" ? "arrow-up" : "arrow-down"} size={12} />}
          {delta}
        </span>
      )}
    </div>
  );
}
