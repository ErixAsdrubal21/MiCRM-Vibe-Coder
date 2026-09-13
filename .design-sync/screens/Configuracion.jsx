// Pantalla 11 — Configuración y perfil. Recreación de
// src/app/(app)/configuracion/page.js, incluyendo el reset de contraseña
// mediado por administrador (PR #9, aún sin mergear a main pero es el
// diseño objetivo) y la gestión de equipo (ICS-29).
const TEAM = [
  { id: 'u1', name: 'Carlos', role: 'Vendedor' },
  { id: 'u2', name: 'Marta', role: 'Administradora' },
];

function initials(name) { return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join(''); }

function Configuracion({ role }) {
  const { Button, Icon, IconButton } = window.MiNegocioCRM;
  const [showPasswordForm, setShowPasswordForm] = React.useState(false);
  const [showInviteForm, setShowInviteForm] = React.useState(false);
  const me = role === 'administrador' ? TEAM[1] : TEAM[0];

  return (
    <>
      <div className="top-bar"><p className="top-bar__title">Configuración</p></div>

      <div className="profile-card">
        <div className="avatar">{initials(me.name)}</div>
        <div>
          <p className="profile-card__name">{me.name}</p>
          <p className="profile-card__role">{me.role}</p>
        </div>
      </div>

      {!showPasswordForm ? (
        <button type="button" className="settings-row" onClick={() => setShowPasswordForm(true)}>
          <span className="settings-row__label"><Icon name="lock" size={18} /> Cambiar contraseña</span>
          <span style={{ color: 'var(--color-mute)' }}><Icon name="chevron-right" size={18} /></span>
        </button>
      ) : (
        <div className="settings-card">
          <p className="field-label">Cambiar contraseña</p>
          <div className="field-group">
            <label className="field-label" htmlFor="cp-actual">Contraseña actual</label>
            <label className="mn-input mn-input--field"><input id="cp-actual" type="password" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1 }} /></label>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="cp-nueva">Nueva contraseña</label>
            <label className="mn-input mn-input--field"><input id="cp-nueva" type="password" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1 }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" full onClick={() => setShowPasswordForm(false)}>Cancelar</Button>
            <Button type="button" variant="primary" full onClick={() => setShowPasswordForm(false)}>Guardar</Button>
          </div>
        </div>
      )}

      {role === 'administrador' && (
        <>
          <p className="section-label">Equipo (solo Administrador)</p>
          {TEAM.map((member) => (
            <div className="team-row" key={member.id}>
              <div>
                <p className="team-row__name">{member.name}</p>
                <p className="team-row__role">{member.role}</p>
              </div>
              {member.id !== me.id && <IconButton icon="key-round" label={`Restablecer contraseña de ${member.name}`} />}
            </div>
          ))}

          {!showInviteForm ? (
            <Button variant="secondary" full onClick={() => setShowInviteForm(true)}>
              <Icon name="user-plus" size={18} /> Invitar usuario
            </Button>
          ) : (
            <div className="settings-card">
              <p className="field-label">Invitar usuario</p>
              <div className="field-group">
                <label className="field-label" htmlFor="iu-nombre">Nombre</label>
                <label className="mn-input mn-input--field"><input id="iu-nombre" type="text" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1 }} /></label>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="iu-correo">Correo</label>
                <label className="mn-input mn-input--field"><input id="iu-correo" type="email" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1 }} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="button" variant="secondary" full onClick={() => setShowInviteForm(false)}>Cancelar</Button>
                <Button type="button" variant="primary" full onClick={() => setShowInviteForm(false)}>Invitar</Button>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ flex: 1 }} />
      <Button variant="danger" full><Icon name="log-out" size={16} /> Cerrar sesión</Button>
    </>
  );
}
window.Configuracion = Configuracion;
