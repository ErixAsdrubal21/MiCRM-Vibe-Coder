"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { getSession, clearSession, SessionContext } from "@/lib/session.js";
import { NAV_BY_ROLE } from "@/nav/navConfig.js";
import "@/design/app-shell.css";

/**
 * Equivalente Next.js de `AppShell.jsx` (mi-crm): ahí usa `<Navigate>`/`<Outlet>`
 * de react-router; aquí no hay Outlet, el layout de App Router ya inyecta
 * `children`, y la sesión (localStorage) solo existe en cliente, por eso el
 * chequeo corre en useEffect en vez de durante el render inicial (SSR).
 */
export default function AppLayout({ children }) {
  const [session, setSessionState] = useState(undefined);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setSessionState(getSession());
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (!session) return null;

  const nav = NAV_BY_ROLE[session.role];

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      <IconButton
        icon="log-out"
        label="Cerrar sesión"
        outline
        onClick={handleLogout}
        style={{ position: "fixed", top: 16, right: 16, zIndex: 30 }}
      />

      <nav className="bottom-nav">
        {nav.items.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`nav-item${pathname === item.path ? " active" : ""}`}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        ))}
      </nav>

      {nav.fab && (
        <Link href="/prospectos/nuevo" className="fab" aria-label="Nuevo prospecto">
          <Icon name="plus" size={22} />
        </Link>
      )}

      <div className="app-shell__content">
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      </div>
    </div>
  );
}
