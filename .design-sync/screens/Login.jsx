// Pantalla 1 — Login/Acceso. Recreación fiel de src/app/login/page.js.
function Login({ onEnter }) {
  const { Button } = window.MiNegocioCRM;
  const [showForgotHelp, setShowForgotHelp] = React.useState(false);

  return (
    <div className="login-screen">
      <p className="wordmark">Mi Negocio<span>CRM</span></p>
      <p className="login-tag">Organiza a tus clientes sin complicarte</p>

      <form className="login-form" onSubmit={(e) => e.preventDefault()}>
        <div className="field-group">
          <label className="field-label" htmlFor="li-email">Correo</label>
          <label className="mn-input mn-input--field">
            <input id="li-email" type="email" placeholder="tu@negocio.com" defaultValue="carlos@minegocio.com"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="li-pass">Contraseña</label>
          <label className="mn-input mn-input--field">
            <input id="li-pass" type="password" placeholder="••••••••" defaultValue="••••••••"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, font: 'inherit', color: 'inherit' }} />
          </label>
        </div>
        <Button type="button" variant="primary" full onClick={() => onEnter('vendedor')}>Entrar como Carlos (vendedor)</Button>
      </form>

      <div className="or-divider">
        <hr className="divider" /><span>o</span><hr className="divider" />
      </div>

      <Button type="button" variant="secondary" full onClick={() => onEnter('administrador')}>Continuar con Google — Marta (admin)</Button>

      {showForgotHelp ? (
        <p className="forgot-help">
          Pide a tu administrador que te restablezca la contraseña desde Configuración » Equipo — te dará una
          temporal para entrar y luego la cambias tú desde tu cuenta.
        </p>
      ) : (
        <button type="button" className="forgot" onClick={() => setShowForgotHelp(true)}>Olvidé mi contraseña</button>
      )}
    </div>
  );
}
window.Login = Login;
