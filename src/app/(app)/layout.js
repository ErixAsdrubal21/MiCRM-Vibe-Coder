import { Suspense } from "react";
import AppLayout from "@/nav/AppLayout.js";

/**
 * `Suspense` alrededor de todas las pantallas protegidas: varias leen la URL
 * con `useSearchParams()` (fichas por `?id=`, filtros de /prospectos y
 * /actividad, alta de oportunidad/venta con cliente preseleccionado). En el
 * build estático (`output: "export"`), Next exige un límite de Suspense por
 * encima de cada uso o falla con "Missing Suspense boundary with
 * useSearchParams". Un solo límite aquí cubre las existentes y las futuras;
 * la barra de navegación (AppLayout) queda fuera y se pinta de inmediato.
 */
export default function ProtectedLayout({ children }) {
  return (
    <AppLayout>
      <Suspense fallback={null}>{children}</Suspense>
    </AppLayout>
  );
}
