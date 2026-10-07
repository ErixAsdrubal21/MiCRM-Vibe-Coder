"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { Button } from "@/design/components/core/Button.jsx";
import PasswordCodeFlow from "./PasswordCodeFlow.js";
import "./login.css";

// Google regresa aquí (no a "/") para poder avisar si la cuenta fue rechazada:
// Convex Auth, cuando `createOrUpdateUser` rechaza, redirige sin `code` y sin
// mensaje de error.
const GOOGLE_RETURN = "/login?via=google";
const GOOGLE_REJECTED_MSG = "Tu cuenta de Google no tiene acceso a este CRM. Contacta a un administrador.";

const subscribeNever = () => () => {};
const readBackFromGoogle = () => new URLSearchParams(window.location.search).get("via") === "google";

/**
 * ICS-6/7/8 + ICS-108: login real (Convex Auth, Password + Google). Sin
 * registro público a propósito — Carlos/Marta se aprovisionan con
 * scripts/provision-user.mjs, no desde este formulario (ver
 * convex/auth.js:createOrUpdateUser, que rechaza cualquier correo que no
 * exista ya como fila en `users`, también vía Google).
 */
export default function Login() {
  const { signIn } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const backFromGoogle = useSyncExternalStore(subscribeNever, readBackFromGoogle, () => false);
  const googleRejected = backFromGoogle && !isLoading && !isAuthenticated;

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/");
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
      router.replace("/");
    } catch (err) {
      setError("Correo o contraseña incorrectos.");
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setGoogleSubmitting(true);
    try {
      await signIn("google", { redirectTo: GOOGLE_RETURN });
    } catch (err) {
      setError("No se pudo iniciar sesión con Google.");
      setGoogleSubmitting(false);
    }
  }

  // ICS-111: recuperar la contraseña con un código por correo.
  if (resetOpen) {
    return (
      <div className="login-screen">
        <p className="wordmark">Mi Negocio<span>CRM</span></p>
        <PasswordCodeFlow
          initialEmail={email}
          onCancel={(result) => {
            setResetOpen(false);
            setNotice(result?.message ?? "");
          }}
        />
      </div>
    );
  }

  return (
    <div className="login-screen">
      <p className="wordmark">Mi Negocio<span>CRM</span></p>
      <p className="login-tag">Organiza a tus clientes sin complicarte</p>
      {notice && <p className="forgot-help">{notice}</p>}

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="email">Correo</label>
          <label className="mn-input mn-input--field">
            <input
              id="email"
              type="email"
              placeholder="tu@negocio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="pass">Contraseña</label>
          <label className="mn-input mn-input--field">
            <input
              id="pass"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>

        {(error || googleRejected) && (
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>
            {error || GOOGLE_REJECTED_MSG}
          </p>
        )}

        <Button type="submit" variant="primary" full disabled={submitting || googleSubmitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="or-divider">
        <hr className="divider" />
        <span>o</span>
        <hr className="divider" />
      </div>

      <Button type="button" variant="secondary" full disabled={submitting || googleSubmitting} onClick={handleGoogle}>
        {googleSubmitting ? "Conectando..." : "Continuar con Google"}
      </Button>

      {/* ICS-111: autoservicio por correo; el restablecimiento por la administradora (ICS-6) sigue como respaldo. */}
      <button type="button" className="forgot" onClick={() => { setNotice(""); setResetOpen(true); }}>
        Olvidé mi contraseña
      </button>
    </div>
  );
}
