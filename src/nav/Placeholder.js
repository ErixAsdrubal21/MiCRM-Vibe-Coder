import TopBar from "./TopBar.js";

/**
 * Contenido real de esta pantalla: milestones 2-6 de crm-mvp (ver Linear).
 * ICS-9/ICS-10 (milestone 1) solo entregan login + navegación base — el
 * resto del shell queda navegable con un stub hasta que le toque su propio
 * milestone (mismo patrón que `mi-crm/web/src/pages/Placeholder.jsx`).
 */
export default function Placeholder({ title, milestone }) {
  return (
    <>
      <TopBar title={title} />
      <div className="list-row">
        <div>
          <p className="list-row__title">Todavía no construida</p>
          <p className="list-row__meta">Llega en el milestone: {milestone}</p>
        </div>
      </div>
    </>
  );
}
