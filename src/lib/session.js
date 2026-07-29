"use client";

import { createContext, useContext } from "react";

/**
 * Sesión en localStorage — mismo patrón que `mockAuth.js` en `mi-crm`.
 * El login real contra Convex (loginMock) ya devuelve un usuario persistido;
 * esto solo cachea esa sesión en el cliente entre pantallas.
 *
 * `SessionContext` reemplaza el `useOutletContext` de react-router que usa
 * `mi-crm` — `AppLayout` provee la sesión ya cargada, así las pantallas hijas
 * no repiten la lectura de localStorage.
 */

const STORAGE_KEY = "mn-crm-session";

export const SessionContext = createContext(null);

export function useSession() {
  return useContext(SessionContext);
}

export function setSession(user) {
  const session = { id: user._id, name: user.name, email: user.email, role: user.role };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function homePathForRole(role) {
  return role === "administrador" ? "/dashboard" : "/tareas";
}
