"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { useSession } from "@/lib/session.js";
import { NAV_BY_ROLE } from "@/nav/navConfig.js";
import "@/design/app-shell.css";

/**
 * ICS-6/7/8: la sesión ya no vive en localStorage — `useConvexAuth()` es la
 * fuente real de "¿hay sesión?" (token válido en el servidor), `useSession()`
 * trae el perfil (rol, nombre) una vez autenticado. No hace falta un
 * SessionContext propio: cualquier pantalla puede llamar `useSession()`
 * directo, ya es una query reactiva, no un valor que haya que pasar por props.
 */
export default function AppLayout({ children }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || !session) return null;

  const nav = NAV_BY_ROLE[session.role];

  async function handleLogout() {
    await signOut();
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

      <div className="app-shell__content">{children}</div>
    </div>
  );
}
