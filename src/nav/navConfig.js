/**
 * Navegación por rol — PRD Pantalla 2/3 + Navegación, ICS-10.
 * Íconos y labels tomados literalmente de los mockups confirmados:
 * ui_kits/crm/02-tareas-del-dia (vendedor) y 03-dashboard-ejecutivo (administrador).
 * Idéntico a `mi-crm/web/src/nav/navConfig.js` — mismas rutas, mismo shell.
 *
 * ICS-103: se agrega "Ventas" (ambos roles) — pipeline comercial real
 * (`opportunities`/`sales`), distinto de "Pipeline", que ahora es
 * "Embudo de prospectos" (ciclo del lead, ICS-98 B2). La ruta sigue siendo
 * `/pipeline` — solo cambia el label; no hace falta redirección.
 */
export const NAV_BY_ROLE = {
  vendedor: {
    home: "/tareas",
    items: [
      { path: "/tareas", icon: "check-square", label: "Tareas" },
      { path: "/prospectos", icon: "users", label: "Prospectos" },
      { path: "/pipeline", icon: "git-branch", label: "Embudo" },
      { path: "/ventas", icon: "dollar-sign", label: "Ventas" },
      { path: "/actividad", icon: "activity", label: "Actividad" },
      { path: "/mi-desempeno", icon: "bar-chart-2", label: "Mi progreso" },
    ],
    fab: true,
  },
  administrador: {
    home: "/dashboard",
    items: [
      { path: "/dashboard", icon: "layout-grid", label: "Dashboard" },
      { path: "/pipeline", icon: "git-branch", label: "Embudo" },
      { path: "/ventas", icon: "dollar-sign", label: "Ventas" },
      { path: "/actividad", icon: "activity", label: "Actividad" },
      { path: "/reportes", icon: "file-bar-chart", label: "Reportes" },
      { path: "/configuracion", icon: "settings", label: "Config" },
    ],
    fab: false,
  },
};
