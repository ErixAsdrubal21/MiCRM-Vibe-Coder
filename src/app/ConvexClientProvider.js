"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Envuelve la app con el cliente de Convex. Antes de correr `npx convex dev`
 * (login + link del proyecto) no existe NEXT_PUBLIC_CONVEX_URL — en ese caso
 * la app sigue funcionando (sin datos) en vez de tronar al arrancar.
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
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
