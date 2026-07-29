# Mi Negocio CRM — Next.js + Convex

CRM para pequeños negocios (ver PRD en Notion / proyecto `crm-mvp` en Linear, equipo ICSAAB). Este repo es la versión Next.js + Convex, separada de `~/mi-crm` (la versión Vite/React con datos mock que ya tiene Login, navegación, Prospectos, Pipeline y Tareas del día construidos como referencia funcional).

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
  schema.js          # Tablas: users, prospects, interactions, followUps, sales
src/
  app/
    layout.js         # Importa el design system global + ConvexClientProvider
    page.js            # Placeholder de arranque
    ConvexClientProvider.js
  design/
    styles.css, components.css, tokens/
    components/core/   # Icon, Button, IconButton, Input, Badge, Tag, KpiTile, PriorityFlag, ProspectCard
```

Cada componente en `src/design/components/core/` lleva `"use client"` porque toda la app es interactiva (sesión mock/real en el cliente) — no hay necesidad de dividir Server/Client Components todavía.

## Deploy

- **Railway**: detecta Next.js automáticamente (Nixpacks) — solo necesita las variables de entorno de `.env.example` configuradas en el proyecto de Railway (`NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, apuntando al deployment de producción de Convex, no al de `convex dev`).
- **Convex**: `npx convex deploy` para el backend de producción, aparte del deploy de Railway.
- **GitHub**: este repo se sube a GitHub antes de conectarlo a Railway (deploy vía integración Git, no CLI manual) — todavía no se ha creado el remoto.
