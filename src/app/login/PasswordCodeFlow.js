"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/design/components/core/Button.jsx";

const INPUT_STYLE = { border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" };
const ERROR_STYLE = { fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 };
const MIN_PASSWORD = 8; // mismo rango que valida convex/passwordReset.js
const MAX_PASSWORD = 128;
const CODE_ERROR = "El código es incorrecto o ya venció. Pide uno nuevo.";
const SERVER_ERROR = "No pudimos confirmar el resultado. Intenta iniciar sesión con tu contraseña nueva; si no funciona, vuelve a intentar el cambio.";

/**
 * ICS-111 — recuperar la contraseña con un código enviado al correo, en tres
 * pantallas: (1) correo, (2) código, (3) contraseña nueva. El código no se
 * valida ni abre sesión en la pantalla 2: se comprueba junto con la
 * contraseña nueva en `passwordReset.confirm` (pantalla 3), que aplica todo en
 * una sola transacción. Después se inicia
 * sesión con la contraseña nueva por el login normal.
 *
 * La pantalla 1 responde igual exista o no el correo; el servidor también
 * (ver convex/passwordReset.js).
 */
export default function PasswordCodeFlow({ initialEmail = "", onCancel }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const requestCode = useMutation(api.passwordReset.request);
  const confirmReset = useMutation(api.passwordReset.confirm);

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await requestCode({ email });
    } catch {
      // El servidor siempre responde igual; un error aquí es de red. Se avanza de todos modos.
    }
    setSubmitting(false);
    setCode("");
    setStep("code");
  }

  function handleCode(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{8}$/.test(code.trim())) return setError("El código tiene 8 dígitos.");
    setStep("password");
  }

  async function handlePassword(e) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      return setError(`La contraseña debe tener entre ${MIN_PASSWORD} y ${MAX_PASSWORD} caracteres.`);
    }
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setSubmitting(true);
    let result;
    try {
      result = await confirmReset({ email, code: code.trim(), newPassword: password });
    } catch {
      // Falla del servidor o de red: no se sabe si el cambio se aplicó (la respuesta pudo perderse).
      setSubmitting(false);
      setError(SERVER_ERROR);
      return;
    }
    if (!result.ok) {
      setSubmitting(false);
      if (result.reason === "INVALID_PASSWORD") return setError(`La contraseña debe tener entre ${MIN_PASSWORD} y ${MAX_PASSWORD} caracteres.`);
      setPassword("");
      setConfirm("");
      setError(CODE_ERROR);
      setStep("code");
      return;
    }
    const { loginEmail } = result;
    try {
      await signIn("password", { email: loginEmail, password, flow: "signIn" });
      router.replace("/");
    } catch {
      // La contraseña ya cambió; solo falló entrar automáticamente.
      setSubmitting(false);
      onCancel({ message: "Tu contraseña se cambió. Inicia sesión con la nueva." });
    }
  }

  const backToEmail = () => {
    setStep("email");
    setCode("");
    setError("");
  };

  return (
    <div className="login-form">
      {step === "email" && (
        <form className="login-form" onSubmit={handleRequest}>
          <p className="field-label" style={{ fontSize: 15, textAlign: "center" }}>Recupera tu contraseña</p>
          <div className="field-group">
            <label className="field-label" htmlFor="pc-email">Correo</label>
            <label className="mn-input mn-input--field">
              <input id="pc-email" type="email" placeholder="tu@negocio.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={INPUT_STYLE} />
            </label>
          </div>
          <p className="forgot-help">Te enviaremos un código de 8 dígitos a ese correo.</p>
          <Button type="submit" variant="primary" full disabled={submitting}>
            {submitting ? "Enviando..." : "Enviarme el código"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form className="login-form" onSubmit={handleCode}>
          <p className="field-label" style={{ fontSize: 15, textAlign: "center" }}>Escribe tu código</p>
          <p className="forgot-help">
            Si {email.trim()} tiene acceso al CRM, te enviamos un código. Revisa también la carpeta de spam. Vence en 15 minutos.
          </p>
          <div className="field-group">
            <label className="field-label" htmlFor="pc-code">Código</label>
            <label className="mn-input mn-input--field">
              <input id="pc-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="12345678" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required style={INPUT_STYLE} />
            </label>
          </div>
          {error && <p style={ERROR_STYLE}>{error}</p>}
          <Button type="submit" variant="primary" full>Continuar</Button>
          <button type="button" className="forgot" onClick={backToEmail}>Pedir otro código</button>
          <p className="forgot-help">Si pides otro, espera un minuto; el anterior deja de servir.</p>
        </form>
      )}

      {step === "password" && (
        <form className="login-form" onSubmit={handlePassword}>
          <p className="field-label" style={{ fontSize: 15, textAlign: "center" }}>Crea tu contraseña nueva</p>
          <div className="field-group">
            <label className="field-label" htmlFor="pc-pass">Contraseña nueva</label>
            <label className="mn-input mn-input--field">
              <input id="pc-pass" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required style={INPUT_STYLE} />
            </label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="pc-confirm">Confirma la contraseña</label>
            <label className="mn-input mn-input--field">
              <input id="pc-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={INPUT_STYLE} />
            </label>
          </div>
          {error && <p style={ERROR_STYLE}>{error}</p>}
          <Button type="submit" variant="primary" full disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar y entrar"}
          </Button>
          <button type="button" className="forgot" onClick={() => { setStep("code"); setError(""); }}>Corregir el código</button>
        </form>
      )}

      <button type="button" className="forgot" onClick={() => onCancel()}>Volver a iniciar sesión</button>
    </div>
  );
}
