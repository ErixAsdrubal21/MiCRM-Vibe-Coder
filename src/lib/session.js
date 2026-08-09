"use client";

import { useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

/**
 * Sesión real vía Convex Auth (ICS-6/7/8, reemplaza el mock de localStorage
 * — ver el historial de git para `mockAuth`/`loginMock` si hace falta
 * referencia). Misma forma que antes (`{ id, name, email, role }`) a
 * propósito, para no tener que tocar cada pantalla que ya consumía
 * `useSession()` — solo cambió de dónde sale el dato: antes de
 * `localStorage`, ahora de una query autenticada real.
 *
 * `undefined` = todavía cargando, `null` = sin sesión, objeto = autenticado.
 */
export function useSession() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");

  if (isLoading) return undefined;
  if (!isAuthenticated) return null;
  if (user === undefined) return undefined;
  if (user === null) return null;

  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

export function homePathForRole(role) {
  return role === "administrador" ? "/dashboard" : "/tareas";
}
