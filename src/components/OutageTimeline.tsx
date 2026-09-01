import { AlertTriangle, Clock3, Info } from 'lucide-react'

import { formatEnergy } from '../domain/scenario'
import type { ReadonlyScenario } from '../domain/types'
import type { IntervalExplanation, SimulationResult } from '../domain/simulation'

export interface OutageTimelineProps {
  readonly scenario: ReadonlyScenario
  readonly simulation: SimulationResult | null
  readonly selectedInterval: number | null
  readonly explanation: IntervalExplanation | null
  readonly explanationError?: string | null
  readonly onExplain: (intervalIndex: number) => void
}

const energyWidth = (energy: number, capacity: number): number => {
  if (capacity <= 0) return 0
  return Math.max(0, Math.min(100, (energy / capacity) * 100))
}

export default function OutageTimeline({
  scenario,
  simulation,
  selectedInterval,
  explanation,
  explanationError = null,
  onExplain,
}: OutageTimelineProps) {
  const intervals = scenario.intervals

  return (
    <section className="timeline-section" aria-labelledby="timeline-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">12-hour outage</p>
          <h2 id="timeline-heading">Outage timeline</h2>
        </div>
        <p className="section-note">Select an interval for an auditable energy explanation.</p>
      </div>

      <div className="timeline-shell">
        <div className="timeline-axis" aria-hidden="true">
          <span>{scenario.outage.start}</span>
          <span>Solar forecast and battery trajectory</span>
          <span>{scenario.outage.end}</span>
        </div>
        <ol className="timeline-list" aria-label="Outage intervals">
          {intervals.map((interval) => {
            const projection = simulation?.intervals[interval.index]
            const isSelected = selectedInterval === interval.index
            const breached = projection?.reserveBreached ?? false
            const width = projection === undefined
              ? 0
              : energyWidth(projection.closingEnergyKWh, simulation?.capacityKWh ?? scenario.battery.capacityKWh)

            return (
              <li className={`timeline-item${isSelected ? ' timeline-item--selected' : ''}${breached ? ' timeline-item--breach' : ''}`} key={interval.index}>
                <button
                  className="timeline-button"
                  type="button"
                  aria-label={`Explain ${interval.label}`}
                  aria-pressed={isSelected}
                  onClick={() => onExplain(interval.index)}
                >
                  <span className="timeline-time">{interval.start}</span>
                  <span className="timeline-marker" aria-hidden="true">
                    <span className="timeline-marker-core" />
                  </span>
                  <span className="timeline-track" aria-hidden="true">
                    <span className="timeline-track-fill" style={{ width: `${width}%` }} />
                  </span>
                  <span className="timeline-summary">
                    <strong>{interval.end}</strong>
                    {projection === undefined ? (
                      <span>Awaiting simulation</span>
                    ) : (
                      <span>{formatEnergy(projection.closingEnergyKWh)} remaining</span>
                    )}
                  </span>
                  <span className="timeline-status">
                    {breached ? <AlertTriangle size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
                    {breached ? 'Below reserve' : projection === undefined ? 'Unsimulated' : 'Above reserve'}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="timeline-legend" role="group" aria-label="Timeline legend">
          <span><span className="legend-swatch legend-swatch--energy" aria-hidden="true" /> Closing battery energy</span>
          <span><span className="legend-swatch legend-swatch--solar" aria-hidden="true" /> Solar input available</span>
          <span><span className="legend-swatch legend-swatch--breach" aria-hidden="true" /> Reserve breach</span>
        </div>
      </div>

      <aside className="explanation-panel" aria-live="polite" aria-labelledby="explanation-heading">
        <div className="explanation-icon" aria-hidden="true">
          {explanation?.reserveBreached ? <AlertTriangle size={17} /> : <Info size={17} />}
        </div>
        <div>
          <p className="panel-kicker">Interval evidence</p>
          <h3 id="explanation-heading">{explanation === null ? 'Choose an interval' : explanation.label}</h3>
          {explanation === null ? (
            <p>{explanationError ?? (simulation === null
              ? 'Run a plan comparison, then choose one of the 12 intervals to see the accounting behind its battery level.'
              : 'Select one of the 12 intervals to see the accounting behind its battery level.')}</p>
          ) : (
            <p>{explanation.accessibleExplanation}</p>
          )}
        </div>
        {explanation !== null && (
          <dl className="explanation-facts">
            <div><dt>Solar</dt><dd>{formatEnergy(explanation.solarKWh)}</dd></div>
            <div><dt>Load</dt><dd>{formatEnergy(explanation.loadKWh)}</dd></div>
            <div><dt>Closing energy</dt><dd>{formatEnergy(explanation.closingEnergyKWh)}</dd></div>
          </dl>
        )}
      </aside>
    </section>
  )
}
