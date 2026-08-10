"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { Button } from "@/design/components/core/Button.jsx";
import { Icon } from "@/design/components/core/Icon.jsx";
import { useSession } from "@/lib/session.js";
import "./configuracion.css";

const ROLE_LABEL = { administrador: "Administradora", vendedor: "Vendedor" };
const FIELD_INPUT_STYLE = { border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" };

function initials(name) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

export default function Configuracion() {
  const session = useSession();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  async function handleLogout() {
    await signOut();
    router.replace("/login");
  }

  if (!session) return null;

  return (
    <>
      <TopBar title="Configuración" />

      <div className="profile-card">
        <div className="avatar">{initials(session.name)}</div>
        <div>
          <p className="profile-card__name">{session.name}</p>
          <p className="profile-card__role">{ROLE_LABEL[session.role]}</p>
        </div>
      </div>

      {!showPasswordForm ? (
        <button type="button" className="settings-row" onClick={() => setShowPasswordForm(true)}>
          <span className="settings-row__label">
            <Icon name="lock" size={18} /> Cambiar contraseña
          </span>
          <span style={{ color: "var(--color-mute)" }}>
            <Icon name="chevron-right" size={18} />
          </span>
        </button>
      ) : (
        <ChangePasswordForm onDone={() => setShowPasswordForm(false)} />
      )}

      {session.role === "administrador" && (
        <TeamSection showInviteForm={showInviteForm} setShowInviteForm={setShowInviteForm} />
      )}

      <div style={{ flex: 1 }} />

      <Button variant="danger" full onClick={handleLogout}>
        <Icon name="log-out" size={16} /> Cerrar sesión
      </Button>
    </>
  );
}

function ChangePasswordForm({ onDone }) {
  const changeOwnPassword = useAction(api.users.changeOwnPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err.message ?? "No se pudo cambiar la contraseña.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="settings-card">
        <p className="field-label">Contraseña actualizada.</p>
        <Button variant="secondary" full onClick={onDone}>Cerrar</Button>
      </div>
    );
  }

  return (
    <form className="settings-card" onSubmit={handleSubmit}>
      <p className="field-label">Cambiar contraseña</p>
      <div className="field-group">
        <label className="field-label" htmlFor="cp-actual">Contraseña actual</label>
        <label className="mn-input mn-input--field">
          <input
            id="cp-actual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            style={FIELD_INPUT_STYLE}
          />
        </label>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="cp-nueva">Nueva contraseña</label>
        <label className="mn-input mn-input--field">
          <input
            id="cp-nueva"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            style={FIELD_INPUT_STYLE}
          />
        </label>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="cp-confirmar">Confirmar nueva contraseña</label>
        <label className="mn-input mn-input--field">
          <input
            id="cp-confirmar"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            style={FIELD_INPUT_STYLE}
          />
        </label>
      </div>
      {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button type="button" variant="secondary" full disabled={submitting} onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" full disabled={submitting}>{submitting ? "Guardando..." : "Guardar"}</Button>
      </div>
    </form>
  );
}

function TeamSection({ showInviteForm, setShowInviteForm }) {
  const team = useQuery(api.users.listTeam, {});

  return (
    <>
      <p className="section-label">Equipo (solo Administrador)</p>
      {team === undefined ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
          Cargando...
        </p>
      ) : (
        team.map((member) => (
          <div className="team-row" key={member._id}>
            <div>
              <p className="team-row__name">{member.name}</p>
              <p className="team-row__role">{ROLE_LABEL[member.role]}</p>
            </div>
          </div>
        ))
      )}

      {!showInviteForm ? (
        <Button variant="secondary" full onClick={() => setShowInviteForm(true)}>
          <Icon name="user-plus" size={18} /> Invitar usuario
        </Button>
      ) : (
        <InviteUserForm onDone={() => setShowInviteForm(false)} />
      )}
    </>
  );
}

function InviteUserForm({ onDone }) {
  const inviteUser = useAction(api.users.inviteUser);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("vendedor");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await inviteUser({ email, name, role });
      setTempPassword(result.tempPassword);
    } catch (err) {
      setError(err.message ?? "No se pudo invitar al usuario.");
    } finally {
      setSubmitting(false);
    }
  }

  if (tempPassword) {
    return (
      <div className="settings-card">
        <div className="temp-password-banner">
          <p className="temp-password-banner__label">Contraseña temporal para {email}</p>
          <p className="temp-password-banner__value">{tempPassword}</p>
          <p className="temp-password-banner__note">Cópiala y compártela con {name} — no se volverá a mostrar.</p>
        </div>
        <Button variant="secondary" full onClick={onDone}>Listo</Button>
      </div>
    );
  }

  return (
    <form className="settings-card" onSubmit={handleSubmit}>
      <p className="field-label">Invitar usuario</p>
      <div className="field-group">
        <label className="field-label" htmlFor="iu-nombre">Nombre</label>
        <label className="mn-input mn-input--field">
          <input id="iu-nombre" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={FIELD_INPUT_STYLE} />
        </label>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="iu-correo">Correo</label>
        <label className="mn-input mn-input--field">
          <input id="iu-correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={FIELD_INPUT_STYLE} />
        </label>
      </div>
      <div className="field-group">
        <span className="field-label">Rol</span>
        <div className="chip-row">
          {[{ value: "vendedor", label: "Vendedor" }, { value: "administrador", label: "Administrador" }].map((r) => (
            <button
              type="button"
              key={r.value}
              className={`chip${role === r.value ? " selected" : ""}`}
              onClick={() => setRole(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button type="button" variant="secondary" full disabled={submitting} onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" full disabled={submitting}>{submitting ? "Invitando..." : "Invitar"}</Button>
      </div>
    </form>
  );
}
