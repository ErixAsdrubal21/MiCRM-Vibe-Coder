import { ConvexClientProvider } from "./ConvexClientProvider";

import "@/design/styles.css";
import "@/design/components.css";
import "@/design/forms.css";

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
