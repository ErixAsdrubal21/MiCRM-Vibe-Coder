export default function TopBar({ title, sub }) {
  return (
    <div className="top-bar">
      <div>
        <p className="top-bar__title">{title}</p>
        {sub && <p className="top-bar__sub">{sub}</p>}
      </div>
    </div>
  );
}
