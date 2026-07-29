/**
 * Navegación por rol — PRD Pantalla 2/3 + Navegación, ICS-10.
 * Íconos y labels tomados literalmente de los mockups confirmados:
 * ui_kits/crm/02-tareas-del-dia (vendedor) y 03-dashboard-ejecutivo (administrador).
 * Idéntico a `mi-crm/web/src/nav/navConfig.js` — mismas rutas, mismo shell.
 */
export const NAV_BY_ROLE = {
  vendedor: {
    home: "/tareas",
    items: [
      { path: "/tareas", icon: "check-square", label: "Tareas" },
      { path: "/prospectos", icon: "users", label: "Prospectos" },
      { path: "/pipeline", icon: "git-branch", label: "Pipeline" },
      { path: "/mi-desempeno", icon: "bar-chart-2", label: "Mi progreso" },
    ],
    fab: true,
  },
  administrador: {
    home: "/dashboard",
    items: [
      { path: "/dashboard", icon: "layout-grid", label: "Dashboard" },
      { path: "/pipeline", icon: "git-branch", label: "Pipeline" },
      { path: "/reportes", icon: "file-bar-chart", label: "Reportes" },
      { path: "/configuracion", icon: "settings", label: "Config" },
    ],
    fab: false,
  },
};
