import {
  BatteryCharging,
  CloudSun,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Undo2,
} from 'lucide-react'
import type { RefObject } from 'react'

import { formatEnergy, formatPercent } from '../domain/scenario'
import type { StoreSnapshot } from '../state/store'

export interface EnergyStatusProps {
  readonly snapshot: StoreSnapshot
  readonly onRefresh: () => void
  readonly onUndo: () => void
  readonly onReset: () => void
  readonly headingRef?: RefObject<HTMLHeadingElement | null>
}

const proposalLabel = (status: StoreSnapshot['activeProposal'] extends infer Proposal
  ? Proposal extends { readonly status: infer Status } ? Status : never
  : never): string => {
  if (status === 'review-requested') return 'Review requested'
  if (status === 'stale') return 'Stale, restage required'
  return 'Staged for review'
}

const persistenceLabel = (mode: StoreSnapshot['persistenceMode']): string => (
  mode === 'persistent' ? 'Persistent locally' : 'Memory only'
)

export default function EnergyStatus({
  snapshot,
  onRefresh,
  onUndo,
  onReset,
  headingRef,
}: EnergyStatusProps) {
  const { battery, outage } = snapshot.scenario
  const proposal = snapshot.activeProposal

  return (
    <section className="status-rail" aria-labelledby="energy-status-heading">
      <div className="section-heading status-heading-row">
        <div>
          <p className="eyebrow">Household control room</p>
          <h2 id="energy-status-heading" ref={headingRef} tabIndex={-1}>Energy status</h2>
        </div>
        <span className="status-indicator status-indicator--healthy">
          <ShieldCheck size={15} aria-hidden="true" />
          Planning ready
        </span>
      </div>

      <div className="status-grid">
        <div className="status-primary">
          <p className="status-label">Household</p>
          <p className="status-value status-value--large">{snapshot.scenario.household.name}</p>
          <p className="status-support">Local scenario, no account or device connection required.</p>
        </div>

        <div className="status-metric">
          <BatteryCharging size={18} aria-hidden="true" />
          <span className="status-label">Stored energy</span>
          <strong>{formatEnergy(battery.startEnergyKWh)}</strong>
          <span>{formatPercent(battery.startChargePercent)} of {formatEnergy(battery.capacityKWh)} total capacity</span>
        </div>

        <div className="status-metric">
          <ShieldCheck size={18} aria-hidden="true" />
          <span className="status-label">Protected reserve</span>
          <strong>{formatEnergy(battery.reserveKWh)}</strong>
          <span>{formatPercent(battery.reservePercent)} minimum target</span>
        </div>

        <div className="status-metric">
          <CloudSun size={18} aria-hidden="true" />
          <span className="status-label">Outage window</span>
          <strong>{outage.start} to {outage.end}</strong>
          <span>{outage.intervalCount} hourly intervals</span>
        </div>
      </div>

      <div className="status-meta" role="group" aria-label="Planning session details">
        <div>
          <span className="status-label">Current policy</span>
          <strong>{snapshot.committedPolicy.planName}</strong>
          <span>{snapshot.committedPolicy.description}</span>
        </div>
        <div>
          <span className="status-label">Forecast</span>
          <strong>{snapshot.forecastKind === 'canonical' ? 'Canonical forecast' : 'Updated forecast'}</strong>
          <span>{snapshot.forecastKind === 'canonical' ? 'Baseline solar estimate' : 'Refresh created a new revision'}</span>
        </div>
        <div>
          <span className="status-label">Revision</span>
          <strong>r{snapshot.workspaceRevision}</strong>
          <span>Session {snapshot.sessionEpoch}</span>
        </div>
        <div>
          <span className="status-label">Persistence</span>
          <strong>{persistenceLabel(snapshot.persistenceMode)}</strong>
          <span>{snapshot.persistenceIssue === null ? 'Changes stay on this browser' : 'Storage is unavailable, session data retained'}</span>
        </div>
      </div>

      <div className="status-actions">
        <div className="status-proposal" aria-live="polite">
          <History size={16} aria-hidden="true" />
          {proposal === null ? (
            <span>No active proposal. Simulate a plan to begin.</span>
          ) : (
            <span>Active proposal: <strong>{proposal.planName}</strong>, {proposalLabel(proposal.status)}</span>
          )}
        </div>
        <div className="action-group">
          <button className="button button--quiet" type="button" onClick={onRefresh}>
            <RefreshCw size={15} aria-hidden="true" />
            Refresh forecast
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={onUndo}
            disabled={!snapshot.undoAvailable}
            title={snapshot.undoAvailable ? 'Undo the latest committed change' : 'Undo is available after a commit'}
          >
            <Undo2 size={15} aria-hidden="true" />
            Undo latest change
          </button>
          <button className="button button--danger-quiet" type="button" onClick={onReset}>
            <RotateCcw size={15} aria-hidden="true" />
            Reset session
          </button>
        </div>
      </div>
    </section>
  )
}
