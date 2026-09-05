/** `action` (ICS-92): nodo opcional a la derecha del título — el CSS de
 * `.top-bar` ya es `justify-content: space-between`, pensado para esto. Los
 * consumidores que no la pasan (pipeline, prospectos, mi-desempeño,
 * dashboard, configuración) quedan idénticos a como estaban. */
export default function TopBar({ title, sub, action }) {
  return (
    <div className="top-bar">
      <div>
        <p className="top-bar__title">{title}</p>
        {sub && <p className="top-bar__sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
