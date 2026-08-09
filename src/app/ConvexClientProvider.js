"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Envuelve la app con el cliente de Convex + Convex Auth (ICS-6/7/8,
 * reemplaza el login mock). Integración solo del lado del cliente, sin
 * middleware de Next.js — esta app ya era 100% client-side, y evita un bug
 * conocido entre convexAuthNextjsMiddleware y Google OAuth en App Router.
 *
 * Antes de correr `npx convex dev` (login + link del proyecto) no existe
 * NEXT_PUBLIC_CONVEX_URL — en ese caso la app sigue funcionando (sin datos)
 * en vez de tronar al arrancar.
 */
export function ConvexClientProvider({ children }) {
  if (!convex) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "NEXT_PUBLIC_CONVEX_URL no está definido — corre `npx convex dev` para conectar Convex. La app sigue funcionando sin datos hasta entonces."
      );
    }
    return children;
  }
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
