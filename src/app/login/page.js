"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { setSession, homePathForRole } from "@/lib/session.js";
import "./login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const loginMock = useMutation(api.users.loginMock);

  async function handleSubmit(e) {
    e.preventDefault();
    const user = await loginMock({ email, provider: "password" });
    const session = setSession(user);
    router.replace(homePathForRole(session.role));
  }

  async function handleGoogle() {
    const user = await loginMock({ provider: "google" });
    const session = setSession(user);
    router.replace(homePathForRole(session.role));
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
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>

        <Button type="submit" variant="primary" full>Entrar</Button>
      </form>

      <div className="or-divider"><hr className="divider" />o<hr className="divider" /></div>

      <Button variant="secondary" full onClick={handleGoogle}>
        <Icon name="chrome" size={18} />
        Continuar con Google
      </Button>

      <a className="forgot" href="#" onClick={(e) => e.preventDefault()}>Olvidé mi contraseña</a>
    </div>
  );
}
