"use client";

import TopBar from "@/nav/TopBar.js";
import { useSession } from "@/lib/session.js";

export default function Dashboard() {
  const session = useSession();
  return (
    <>
      <TopBar title={`Hola, ${session.name}`} sub="Dashboard ejecutivo — llega en milestone 5" />
      <div className="list-row">
        <div>
          <p className="list-row__title">Contenido real: ICS-23</p>
          <p className="list-row__meta">Por ahora este shell solo prueba login + navegación (ICS-9/ICS-10)</p>
        </div>
      </div>
    </>
  );
}
