"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import TopBar from "@/nav/TopBar.js";
import { Button } from "@/design/components/core/Button.jsx";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { useSession } from "@/lib/session.js";
import "./configuracion.css";
import { errorMessage } from "@/lib/errors.js";

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
        <TeamSection ownUserId={session.id} showInviteForm={showInviteForm} setShowInviteForm={setShowInviteForm} />
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
      setError(errorMessage(err, "No se pudo cambiar la contraseña."));
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

function TeamSection({ ownUserId, showInviteForm, setShowInviteForm }) {
  const team = useQuery(api.users.listTeam, {});

  return (
    <>
      <p className="section-label">Equipo (solo Administrador)</p>
      {team === undefined ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--color-mute)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
          Cargando...
        </p>
      ) : (
        team.map((member) => <TeamMemberRow key={member._id} member={member} isSelf={member._id === ownUserId} />)
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

/**
 * Fila de miembro del equipo: "restablecer contraseña" (hallazgo de
 * auditoría PRD↔app, 2026-09-13 — ver `resetUserPassword` en convex/users.js
 * para el porqué de esta forma en vez de un correo de recuperación) y
 * desactivar/reactivar la cuenta (ICS-117) y permitir/quitar Google
 * (ICS-118). Restablecer y desactivar no se ofrecen sobre la propia fila del
 * admin — para uno mismo ya existe "Cambiar contraseña" arriba, y nadie puede
 * desactivarse a sí mismo —; Google sí, para poder permitírselo a sí misma.
 */
const CONFIRM_LABEL = {
  reset: "Sí, restablecer",
  deactivate: "Sí, desactivar",
  reactivate: "Sí, reactivar",
  allowGoogle: "Sí, permitir",
  removeGoogle: "Sí, quitar",
};
const CONFIRM_QUESTION = {
  reset: (name) => `¿Restablecer la contraseña de ${name}? También se le quitará el acceso con Google.`,
  deactivate: (name) => `¿Desactivar a ${name}? Se cerrarán sus sesiones y no podrá entrar. Sus datos se conservan.`,
  reactivate: (name) => `¿Reactivar a ${name}? Podrá volver a entrar con su contraseña.`,
  allowGoogle: (name) => `¿Permitir que ${name} entre con Google? Solo con una cuenta de Google que tenga su mismo correo.`,
  removeGoogle: (name, isSelf) =>
    isSelf
      ? "¿Quitarte el acceso con Google? Se cerrarán tus otras sesiones; esta sigue abierta."
      : `¿Quitar el acceso con Google a ${name}? Se desvincula su cuenta de Google y se cierran sus sesiones.`,
};

function googleStatus(member) {
  if (!member.googleAllowed) return "";
  return member.googleLinked ? " · Google vinculado" : " · Google permitido";
}

function TeamMemberRow({ member, isSelf }) {
  const resetUserPassword = useAction(api.users.resetUserPassword);
  const deactivateUser = useMutation(api.users.deactivateUser);
  const reactivateUser = useMutation(api.users.reactivateUser);
  const setGoogleAllowed = useMutation(api.users.setGoogleAllowed);
  const [confirming, setConfirming] = useState(null); // null | clave de CONFIRM_LABEL
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState(null);
  const disabled = Boolean(member.disabledAt);

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      if (confirming === "reset") {
        const result = await resetUserPassword({ userId: member._id });
        setTempPassword(result.tempPassword);
      } else if (confirming === "deactivate") {
        await deactivateUser({ userId: member._id });
      } else if (confirming === "reactivate") {
        await reactivateUser({ userId: member._id });
      } else if (confirming === "allowGoogle" || confirming === "removeGoogle") {
        await setGoogleAllowed({ userId: member._id, allowed: confirming === "allowGoogle" });
      }
      setConfirming(null);
    } catch (err) {
      setError(errorMessage(err, "No se pudo completar la acción."));
    } finally {
      setBusy(false);
    }
  }

  if (tempPassword) {
    return (
      <div className="settings-card">
        <div className="temp-password-banner">
          <p className="temp-password-banner__label">Contraseña temporal para {member.name}</p>
          <p className="temp-password-banner__value">{tempPassword}</p>
          <p className="temp-password-banner__note">Cópiala y compártesela — no se volverá a mostrar. Cerró sus sesiones activas.</p>
        </div>
        <Button variant="secondary" full onClick={() => setTempPassword(null)}>Listo</Button>
      </div>
    );
  }

  return (
    <div className={`team-row${disabled ? " team-row--disabled" : ""}`}>
      <div>
        <p className="team-row__name">{member.name}</p>
        <p className="team-row__role">{ROLE_LABEL[member.role]}{disabled ? " · Desactivada" : googleStatus(member)}</p>
        {confirming && <p className="team-row__confirm">{CONFIRM_QUESTION[confirming](member.name, isSelf)}</p>}
        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 11.5, color: "var(--color-critical)", margin: "2px 0 0" }}>{error}</p>}
      </div>
      {confirming ? (
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>No</Button>
          <Button variant="primary" disabled={busy} onClick={handleConfirm}>{busy ? "..." : CONFIRM_LABEL[confirming]}</Button>
        </div>
      ) : disabled ? (
        !isSelf && <IconButton icon="user-check" label={`Reactivar a ${member.name}`} onClick={() => setConfirming("reactivate")} />
      ) : (
        <div style={{ display: "flex", gap: 4 }}>
          {member.googleAllowed ? (
            <IconButton icon="unlink" label={`Quitar Google a ${member.name}`} onClick={() => setConfirming("removeGoogle")} />
          ) : (
            <IconButton icon="link" label={`Permitir Google a ${member.name}`} onClick={() => setConfirming("allowGoogle")} />
          )}
          {!isSelf && (
            <>
              <IconButton icon="key-round" label={`Restablecer contraseña de ${member.name}`} onClick={() => setConfirming("reset")} />
              <IconButton icon="user-x" label={`Desactivar a ${member.name}`} onClick={() => setConfirming("deactivate")} />
            </>
          )}
        </div>
      )}
    </div>
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
      setError(errorMessage(err, "No se pudo invitar al usuario."));
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
