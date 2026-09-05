import { ConvexClientProvider } from "./ConvexClientProvider";

import "@/design/styles.css";
import "@/design/components.css";
import "@/design/forms.css";

/**
 * Toda la app cuelga de sesión/datos de Convex del lado del cliente (ver
 * ConvexClientProvider.js) — no hay nada que pre-renderizar como estático.
 * Sin esto, `next build` intenta generar páginas como /prospectos/nuevo en
 * build time; ahí `useSession()` → `useConvexAuth()` truena porque no hay
 * `ConvexAuthProvider` en contexto (el provider se salta si todavía no
 * existe `NEXT_PUBLIC_CONVEX_URL`, que es justo el caso en el paso de build
 * de un pipeline de CI/CD). `force-dynamic` en el layout raíz lo propaga a
 * toda la app: cada página se renderiza al pedirse, nunca en build.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mi Negocio CRM",
  description: "CRM para pequeños negocios — Nuevo prospecto, Pipeline, Tareas del día y más.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
