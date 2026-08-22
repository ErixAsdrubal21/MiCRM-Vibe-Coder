"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/design/components/core/Button.jsx";
import "./login.css";

/**
 * ICS-6/7/8: login real (Convex Auth, Password + Google). Sin registro
 * público a propósito — Carlos/Marta se aprovisionan con
 * scripts/provision-user.mjs, no desde este formulario (ver
 * convex/auth.js:createOrUpdateUser, que rechaza cualquier correo que no
 * exista ya como fila en `users`, incluso vía Google).
 */
export default function Login() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

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
      await signIn("google");
    } catch (err) {
      setError("No se pudo iniciar sesión con Google.");
      setGoogleSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <p className="wordmark">Mi Negocio<span>CRM</span></p>
      <p className="login-tag">Organiza a tus clientes sin complicarte</p>

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

        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}

        <Button type="submit" variant="primary" full disabled={submitting || googleSubmitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="or-divider">
        <hr className="divider" />
        <span>o</span>
        <hr className="divider" />
      </div>

      <Button
        type="button"
        variant="secondary"
        full
        disabled={submitting || googleSubmitting}
        onClick={handleGoogle}
      >
        {googleSubmitting ? "Conectando..." : "Continuar con Google"}
      </Button>

      <a className="forgot" href="#" onClick={(e) => e.preventDefault()}>Olvidé mi contraseña</a>
    </div>
  );
}
