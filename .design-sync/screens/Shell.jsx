// Chrome real de la app — recreación de src/nav/AppLayout.js: bottom-nav por
// rol (src/nav/navConfig.js, literal), FAB de "Nuevo prospecto" (solo
// vendedor), botón de cerrar sesión fijo arriba a la derecha.
const NAV_BY_ROLE = {
  vendedor: {
    items: [
      { key: 'tareas', icon: 'check-square', label: 'Tareas' },
      { key: 'prospectos', icon: 'users', label: 'Prospectos' },
      { key: 'pipeline', icon: 'git-branch', label: 'Pipeline' },
      { key: 'mi-desempeno', icon: 'bar-chart-2', label: 'Mi progreso' },
    ],
    fab: true,
  },
  administrador: {
    items: [
      { key: 'dashboard', icon: 'layout-grid', label: 'Dashboard' },
      { key: 'pipeline', icon: 'git-branch', label: 'Pipeline' },
      { key: 'reportes', icon: 'file-bar-chart', label: 'Reportes' },
      { key: 'configuracion', icon: 'settings', label: 'Config' },
    ],
    fab: false,
  },
};
window.NAV_BY_ROLE = NAV_BY_ROLE;

function Shell({ role, active, onNavigate, onLogout, children }) {
  const { Icon, IconButton } = window.MiNegocioCRM;
  const nav = NAV_BY_ROLE[role];

  return (
    <div className="app-shell">
      <IconButton icon="log-out" label="Cerrar sesión" outline onClick={onLogout}
        style={{ position: 'fixed', top: 16, right: 16, zIndex: 30 }} />

      <nav className="bottom-nav">
        {nav.items.map((item) => (
          <button key={item.key} type="button" className={`nav-item${active === item.key ? ' active' : ''}`} onClick={() => onNavigate(item.key)}>
            <Icon name={item.icon} size={20} />{item.label}
          </button>
        ))}
      </nav>

      {nav.fab && (
        <button type="button" className="fab" aria-label="Nuevo prospecto" onClick={() => onNavigate('nuevo-prospecto')}>
          <Icon name="plus" size={22} />
        </button>
      )}

      <div className="app-shell__content">{children}</div>
    </div>
  );
}
window.Shell = Shell;
