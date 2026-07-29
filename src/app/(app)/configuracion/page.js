"use client";

import { useRouter } from "next/navigation";
import TopBar from "@/nav/TopBar.js";
import { Button } from "@/design/components/core/Button.jsx";
import { Icon } from "@/design/components/core/Icon.jsx";
import { useSession, clearSession } from "@/lib/session.js";

export default function Configuracion() {
  const session = useSession();
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <>
      <TopBar title="Configuración y perfil" sub="Pantalla completa (ICS-28) llega en milestone 6" />
      <div className="list-row">
        <div>
          <p className="list-row__title">{session.name}</p>
          <p className="list-row__meta">
            {session.role === "administrador" ? "Administradora" : "Vendedor"} · {session.email}
          </p>
        </div>
      </div>
      <Button variant="danger" full onClick={handleLogout}>
        <Icon name="log-out" size={16} /> Cerrar sesión
      </Button>
    </>
  );
}
