import React, { useState } from 'react';
import { PeriodToggle } from 'mi-crm-next';

/** Pill Semana/Mes compartido por Mi desempeño, Dashboard y Reportes — interactivo, cada export fija un estado inicial distinto. */
export function SemanaSeleccionada() {
  const [value, setValue] = useState('semana');
  return <PeriodToggle value={value} onChange={setValue} />;
}

export function MesSeleccionado() {
  const [value, setValue] = useState('mes');
  return <PeriodToggle value={value} onChange={setValue} />;
}
