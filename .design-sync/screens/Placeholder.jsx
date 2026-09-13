// Mismo patrón que src/nav/Placeholder.js — para las 3 pantallas que este
// kit NO trae todavía (Dashboard, Lista de prospectos, Ficha del cliente):
// se borraron del proyecto de diseño por tener la paleta vieja y quedan como
// trabajo de seguimiento, no como parte de las 8 pedidas en esta ronda.
function Placeholder({ title }) {
  return (
    <>
      <div className="top-bar"><p className="top-bar__title">{title}</p></div>
      <div className="list-row">
        <div>
          <p className="list-row__title">Todavía no está en este kit</p>
          <p className="list-row__meta">Pendiente de rehacer con la paleta nueva (ver NOTES.md)</p>
        </div>
      </div>
    </>
  );
}
window.Placeholder = Placeholder;
