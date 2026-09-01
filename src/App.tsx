import { BatteryCharging, ShieldCheck, Zap } from 'lucide-react'

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="WattKeep home">
          <span className="brand-mark" aria-hidden="true">
            <Zap size={17} strokeWidth={1.5} />
          </span>
          <span>WattKeep</span>
        </a>
        <span className="mode-label">
          <span className="status-dot" aria-hidden="true" />
          Local planning mode
        </span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Outage resilience planner</p>
        <h1 id="page-title">Make stored energy last.</h1>
        <p className="intro-copy">
          Decide what must stay powered. WattKeep makes the stored energy last
          through the night.
        </p>

        <div className="baseline-panel" role="status" aria-live="polite">
          <div className="baseline-heading">
            <span className="icon-badge" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div>
              <p className="panel-kicker">Baseline scenario</p>
              <p className="panel-title">Seeded household ready</p>
            </div>
            <span className="ready-label">Ready</span>
          </div>

          <div className="baseline-values" aria-label="Baseline battery summary">
            <div className="baseline-value">
              <span>Battery</span>
              <strong>13.5 kWh</strong>
            </div>
            <div className="baseline-value">
              <span>Starting charge</span>
              <strong>78%</strong>
            </div>
            <div className="baseline-value">
              <span>Outage window</span>
              <strong>18:00 to 06:00</strong>
            </div>
          </div>

          <p className="loading-note">
            <BatteryCharging size={16} aria-hidden="true" />
            Loading planning controls
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
