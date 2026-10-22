"use client";

import { useEffect, useRef } from "react";
import { turnstileSiteKeyFor } from "../../shared/turnstileKeys.js";

/**
 * ICS-123 — widget de Cloudflare Turnstile. Entrega el token por `onToken`
 * (cadena vacía si vence o falla). El token es de un solo uso: cambia
 * `resetKey` para volver a mostrarlo después de usarlo. La CSP de /login
 * permite challenges.cloudflare.com (scripts/generate-headers.mjs).
 */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise = null;

function loadTurnstile() {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("No se pudo cargar la verificación."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export default function TurnstileWidget({ action, onToken, resetKey = 0 }) {
  const containerRef = useRef(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId = null;
    let cancelled = false;
    onTokenRef.current("");
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKeyFor(process.env.NEXT_PUBLIC_CONVEX_URL),
          action,
          language: "es",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => onTokenRef.current(""));
    return () => {
      cancelled = true;
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, resetKey]);

  return <div ref={containerRef} className="turnstile-box" />;
}
