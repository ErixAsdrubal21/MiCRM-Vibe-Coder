# Mi Negocio CRM — Next.js + Convex

CRM para pequeños negocios (ver PRD en Notion / proyecto `crm-mvp` en Linear, equipo ICSAAB). Este repo es la versión Next.js + Convex, separada de `~/mi-crm` (la versión Vite/React con datos mock, usada como referencia de estilo y de comportamiento al portar cada pantalla).

**Estado actual:** Login + navegación por rol (ICS-9/10), gestión de prospectos y venta/seguimiento (ICS-11 a ICS-19), productividad diaria de Carlos (ICS-20 a ICS-22) y visibilidad y control de Marta (ICS-23 a ICS-27: dashboard ejecutivo, alerta de oportunidades sin atención, reportes de ventas/pérdidas con exportación a CSV), con backend real en Convex — permisos por rol e invariantes de negocio validados del lado del servidor, no solo ocultos en la UI. Las queries de métricas ejecutivas (`dashboard`/`reportes`) exigen rol Administrador igual que las mutations de escritura exigen Vendedor. Milestone 6 (configuración, gestión de equipo) todavía no está construido.

## Stack

- **Next.js 16** (App Router, JavaScript, sin Tailwind — el sistema de diseño usa CSS custom properties propias).
- **Convex** como base de datos/backend (`convex/schema.js`).
- **Design system**: portado de `~/Documents/VIBE CODER NEXT/Design/stitch_essential_crm_design_system` (tokens, componentes core) a `src/design/`. Es la misma fuente visual confirmada que usa `mi-crm`.
- Deploy: **Cloudflare Pages** (frontend como sitio estático, `https://crm.icsaab.com`) + **Convex Cloud** (backend). Ver la sección Deploy.

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

**Modo local vs. cuenta real:** `npx convex dev` arrancó en modo *anónimo* (`CONVEX_DEPLOYMENT=anonymous:anonymous-mi-crm-next`) — backend local en `127.0.0.1:3210`, sin login, ideal para desarrollar pantallas. Antes de desplegar a producción hace falta `npx convex login` (login real por navegador) y `npx convex deploy`, que genera un `NEXT_PUBLIC_CONVEX_URL` de nube distinto al local — en producción lo inyecta el build de Cloudflare Pages (ver Deploy).

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
      prospectos/, prospectos/nuevo/, prospectos/ficha/ (?id=), prospectos/interaccion/ (?id=)
      ventas/, ventas/detalle/ (?id=), ventas/nueva-oportunidad/, ventas/nueva-venta/
      pipeline/, tareas/, tareas/nueva/, actividad/, dashboard/, mi-desempeno/, reportes/, configuracion/
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
- **Cloudflare Pages** (proyecto `micrm-vibe-coder`, ICS-109): `next.config.mjs` usa `output: "export"`, así que `npm run build` genera un sitio estático en `out/` (no hay servidor de Next.js; `npm start` no aplica). Producción = rama `main` en `https://crm.icsaab.com`; cada otra rama genera una vista previa en `<rama>.micrm-vibe-coder.pages.dev` contra el Convex de desarrollo.
  - Build command: `if [ "$CF_PAGES_BRANCH" = "main" ]; then npx convex deploy --cmd 'npm run build'; else npm run build; fi` — en `main` primero publica funciones/esquema en Convex prod y, solo si eso tiene éxito, compila el frontend con `NEXT_PUBLIC_CONVEX_URL` inyectada. Salida: `out`.
  - Variables: `NODE_VERSION=22`; Production `CONVEX_DEPLOY_KEY` (llave de despliegue de Convex prod, solo en Cloudflare, nunca en el repo); Preview `NEXT_PUBLIC_CONVEX_URL` del deployment de desarrollo.
  - `npm run build` también genera `out/_headers` (ICS-115, `scripts/generate-headers.mjs`): cabeceras de seguridad y una CSP por ruta con los hashes de los scripts inline.
- **Convex**: prod `perfect-crocodile-599`, dev `giddy-kiwi-388`. Se despliega solo con cada merge a `main` (ver arriba); no hace falta `npx convex deploy` a mano.
- **Railway** fue el hosting del frontend hasta ICS-109; ya no se usa y sus servicios se retiran en ICS-114.

## Tests automatizados — decisión (ICS-90)

El repo no tiene ningún framework de test instalado. La verificación en cada milestone ha sido: `npx eslint .` + `npm run build` + `npx convex dev` (typecheck de funciones/esquema) limpios, más smoke tests standalone contra un deployment real (`scripts/smoke-*.mjs`, autenticados con Convex Auth) y click-through manual/Playwright contra `dev` o producción para cada feature nueva.

**Decisión (2026-09-22):** mantener ese enfoque — sin `vitest`/`convex-test` por ahora — en vez de introducir un framework nuevo dentro de este mismo pase. Justificación: el patrón actual ya cubre lo que estos issues necesitaban verificar (reglas de negocio + permisos + UI real), y cambiar de herramienta es una decisión de alcance aparte que vale la pena tomar con calma, no colada dentro de una feature. Queda como deuda técnica explícita, no como olvido: si el equipo crece o la lógica de negocio se vuelve más difícil de cubrir con smoke scripts manuales, `vitest` + `convex-test` (soporte oficial de Convex para tests unitarios de funciones, sin desplegar) es la opción recomendada para retomar.
