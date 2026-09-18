export default function Titlebar(): JSX.Element {
  return (
    <div className="titlebar">
      <div className="titlebar-left" />
      <div className="titlebar-drag" />
      <div className="titlebar-right">
        <button onClick={() => window.api.window.minimize()} title="Minimizar">
          &#8211;
        </button>
        <button onClick={() => window.api.window.maximize()} title="Maximizar">
          &#9633;
        </button>
        <button className="close" onClick={() => window.api.window.close()} title="Cerrar">
          &#10005;
        </button>
      </div>
    </div>
  )
}
