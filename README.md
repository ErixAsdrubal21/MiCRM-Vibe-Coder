# Mi Negocio CRM — Next.js + Convex

CRM para pequeños negocios (ver PRD en Notion / proyecto `crm-mvp` en Linear, equipo ICSAAB). Este repo es la versión Next.js + Convex, separada de `~/mi-crm` (la versión Vite/React con datos mock, usada como referencia de estilo y de comportamiento al portar cada pantalla).

**Estado actual:** Login + navegación por rol (ICS-9/10), gestión de prospectos y venta/seguimiento (ICS-11 a ICS-19), productividad diaria de Carlos (ICS-20 a ICS-22) y visibilidad y control de Marta (ICS-23 a ICS-27: dashboard ejecutivo, alerta de oportunidades sin atención, reportes de ventas/pérdidas con exportación a CSV), con backend real en Convex — permisos por rol e invariantes de negocio validados del lado del servidor, no solo ocultos en la UI. Las queries de métricas ejecutivas (`dashboard`/`reportes`) exigen rol Administrador igual que las mutations de escritura exigen Vendedor. Milestone 6 (configuración, gestión de equipo) todavía no está construido.

## Stack

- **Next.js 16** (App Router, JavaScript, sin Tailwind — el sistema de diseño usa CSS custom properties propias).
- **Convex** como base de datos/backend (`convex/schema.js`).
- **Design system**: portado de `~/Documents/VIBE CODER NEXT/Design/stitch_essential_crm_design_system` (tokens, componentes core) a `src/design/`. Es la misma fuente visual confirmada que usa `mi-crm`.
- Deploy destino: **Railway** (frontend Next.js) + **Convex Cloud** (backend, deploy separado vía `npx convex deploy`).

## Arrancar en local

```bash
npm install

# Deja esto corriendo en una terminal aparte mientras desarrollas — levanta un
# backend local de Convex (sin necesitar cuenta ni login) y sincroniza
# convex/schema.js automáticamente. Ya se corrió una vez: existe .env.local
# con CONVEX_DEPLOYMENT=anonymous:... y NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210.
npx convex dev

# En otra terminal:
npm run dev
```

Abre http://localhost:3000 — con `convex dev` corriendo, la página de inicio muestra "Convex: conectado"; si `convex dev` no está corriendo (o no existe `.env.local` todavía), muestra "sin conectar" pero el resto de la app sigue funcionando igual.

**Modo local vs. cuenta real:** `npx convex dev` arrancó en modo *anónimo* (`CONVEX_DEPLOYMENT=anonymous:anonymous-mi-crm-next`) — backend local en `127.0.0.1:3210`, sin login, ideal para desarrollar pantallas. Antes de desplegar a producción hace falta `npx convex login` (login real por navegador) y `npx convex deploy`, que genera un `NEXT_PUBLIC_CONVEX_URL` de nube distinto al local — ese es el que va en las variables de entorno de Railway.

## Estructura

```
convex/
  schema.js           # Tablas: users, prospects, interactions, followUps, sales
  permissions.js       # requireUser/requireVendedor/requireAdministrador/requireProspect — guardia de rol
  lib.js               # helpers compartidos (isActiveStage, lastContactAt, pendingFollowUp, daysSince)
  prospects.js          # list/pipeline/get/create/update/changeStage (incl. venta cerrada, ICS-21)
  interactions.js       # add (ICS-15/16)
  followUps.js          # today/complete (ICS-19)
  metrics.js             # myPerformance (ICS-22), dashboard/reportes (ICS-23/24/25/26/27) — gateadas a Administrador
  users.js               # loginMock (ICS-9)
src/
  app/
    layout.js         # Importa el design system global + ConvexClientProvider
    login/page.js
    (app)/             # route group con AppLayout (nav por rol, requiere sesión)
      prospectos/, prospectos/nuevo/, prospectos/[id]/, prospectos/[id]/interaccion/
      pipeline/, tareas/, dashboard/, mi-desempeno/, reportes/, configuracion/
    ConvexClientProvider.js
  components/
    StageChangePicker.js  # compartido entre Ficha y Pipeline
  lib/
    session.js          # sesión mock en localStorage + SessionContext
    prospects.js          # constantes/labels/helpers puros (STAGES, contactMetaLabel, etc.)
  nav/
    AppLayout.js, TopBar.js, navConfig.js, Placeholder.js
  design/
    styles.css, components.css, forms.css, app-shell.css, tokens/
    components/core/   # Icon, Button, IconButton, Input, Badge, Tag, KpiTile, PerfTile, PeriodToggle, PriorityFlag, ProspectCard
```

Cada componente en `src/design/components/core/` lleva `"use client"` porque toda la app es interactiva (sesión mock/real en el cliente) — no hay necesidad de dividir Server/Client Components todavía.

**Seguridad MVP:** el login sigue siendo mock (`actorId` viene de `localStorage`, sin autenticación real todavía — ICS-6/7/8 en Backlog). Las mutations de escritura validan `requireVendedor`, y las queries de métricas ejecutivas (`dashboard`/`reportes`) validan `requireAdministrador` — ambas del lado del servidor, así que un bug de UI (o una URL abierta directamente, como `/dashboard` sin pasar por la nav) no puede saltarse los permisos. Pero un cliente que conozca deliberadamente el `_id` de otro usuario sí podría suplantarlo hasta que exista auth real.

## Deploy

- **GitHub**: este repo vive en `github.com/ErixAsdrubal21/MiCRM-Vibe-Coder`, rama `main`.
- **Railway**: detecta Next.js automáticamente (Nixpacks) — solo necesita las variables de entorno de `.env.example` configuradas en el proyecto de Railway (`NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, apuntando al deployment de producción de Convex, no al de `convex dev`), conectado vía integración Git a este repo.
- **Convex**: hoy corre en modo anónimo/local (`npx convex dev`, sin cuenta). Antes de desplegar hace falta `npx convex login` (login real por navegador, requiere intervención manual del usuario) + `npx convex deploy`, que genera el `NEXT_PUBLIC_CONVEX_URL` de producción — ese es el que va en Railway, no el de `convex dev`.
