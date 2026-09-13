import React from 'react';
import { ProspectCard } from 'mi-crm-next';

/** La unidad de referencia de la app de Carlos — WhatsApp/llamar sin salir de la lista de tareas del día. */
export function ContactoNormal() {
  return (
    <ProspectCard
      name="Ferretería El Tornillo"
      business="Interesado en tinacos 1100L"
      stage="negociacion"
      daysSinceContact={1}
      onWhatsApp={() => {}}
      onCall={() => {}}
    />
  );
}

/** En riesgo — más de 3 días sin contacto, el Tag rojo reemplaza el texto de "hace N días". */
export function EnRiesgo() {
  return (
    <ProspectCard
      name="Abarrotes Doña Lupe"
      business="Pidió cotización de anaqueles"
      stage="cotizacion"
      daysSinceContact={5}
      onWhatsApp={() => {}}
      onCall={() => {}}
    />
  );
}

/** Con prioridad manual asignada — chip de PriorityFlag junto a la meta de contacto. */
export function ConPrioridad() {
  return (
    <ProspectCard
      name="Taller Mecánico Ríos"
      business="Servicio de mantenimiento mensual"
      stage="contactado"
      priority="alta"
      daysSinceContact={0}
      onWhatsApp={() => {}}
      onCall={() => {}}
    />
  );
}
