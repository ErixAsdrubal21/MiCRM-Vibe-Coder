## Mi Negocio CRM — cómo construir con este sistema

CRM web responsive mobile-first para pequeños negocios (Carlos, vendedor, celular; Marta, dueña, celular/tablet). Sin gradientes ni sombras duras — planas, cálidas, densas pero respirables.

**Setup.** Sin provider ni wrapper de contexto — cada componente es standalone, sin theme provider. Basta con montar el árbol; los tokens vienen de `styles.css` (cargado globalmente, no por componente).

**Idioma de estilos: variables CSS + un vocabulario fijo de clases `mn-*`.** No hay sistema de utilidades (nada de Tailwind). Cada componente trae su propia clase raíz + modificadores; compón con esas clases, nunca inventes nuevas para lo que ya existe:

| Familia | Clases reales |
|---|---|
| Botón | `mn-button`, `mn-button--primary\|secondary\|ghost\|danger`, `mn-button--pill`, `mn-button--full` |
| Badge de etapa | `mn-badge`, `mn-badge--nuevo\|contactado\|cotizacion\|negociacion\|ganado\|perdido` (6 fijas, exclusivas) |
| Tag de metadata | `mn-tag`, `mn-tag--risk\|success\|neutral` |
| Input | `mn-input` (buscador, pill) / `mn-input--field` (campo de formulario) |
| Botón solo-ícono | `mn-icon-button`, `mn-icon-button--outline` |
| KPI del dashboard | `mn-kpi-tile`, `mn-kpi-tile--warn` |
| Rendimiento (Mi desempeño) | `mn-perf-tile`, `mn-perf-tile__delta--up\|down\|flat` |
| Prioridad manual | `mn-priority-flag`, `mn-priority-flag--alta\|media\|baja`, `mn-priority-flag--inline` |
| Toggle de período | `mn-period-toggle` (hijos `<button>` con clase `active`) |
| Tarjeta de prospecto | `mn-prospect-card` |

Para layout libre (grids, stacks) usa estilos inline o `display:flex/grid` — no hay clases de utilidad de espaciado; los tokens `--radius-*` y el espaciado van embebidos en cada componente, no se exponen sueltos.

**Tokens (`var(--*)`), reales, usados así en toda la app:**
- Superficie/texto: `--color-canvas`, `--color-surface`, `--color-surface-sunken`, `--color-hairline`, `--color-ink`, `--color-body`, `--color-mute`.
- Acento — **CTA-only**, nunca para estado: `--color-accent`, `--color-accent-pressed`, `--color-accent-tint`.
- Semántico (separado del acento): `--color-critical`, `--color-critical-tint`, `--color-success`, `--color-success-tint`.
- Etapa del pipeline (6 fijas): `--color-stage-<etapa>` + `--color-stage-<etapa>-tint`.
- Prioridad: `--color-priority-alta|media|baja`.
- Tipografía: `--font-ui` (Inter). Hay tokens `--type-*` por nivel jerárquico (kpi-display, headline-screen, etc.) en `tokens/typography.css` — úsalos en vez de tamaños sueltos.
- Modo oscuro completo: los mismos nombres se redefinen bajo `prefers-color-scheme: dark` y `[data-theme="dark"]` — nunca fondo/texto hardcoded, siempre el token.

**Dónde está la verdad.** Lee `styles.css` (cierre de `@import` que reciben los diseños: tokens + `_ds_bundle.css`) antes de estilizar. Cada componente trae su `.prompt.md` con la firma de props real.

**Ejemplo idiomático** (fila de prospecto con acción, compuesto de piezas reales):

```jsx
import { Badge, Button } from 'mi-crm-next';

<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
  <div>
    <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-ink)' }}>Ferretería El Tornillo</p>
    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-mute)' }}>Interesado en tinacos 1100L</p>
  </div>
  <Badge stage="negociacion" />
  <Button variant="primary">Contactar</Button>
</div>
```
