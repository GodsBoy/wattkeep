import { AlertTriangle, ArrowRight, Check, CircleHelp, Play, ShieldCheck } from 'lucide-react'

import { formatEnergy, formatPercent } from '../domain/scenario'
import type { PlanId, ReadonlyScenario } from '../domain/types'
import type { PlanComparison as PlanComparisonResult, SimulationResult } from '../domain/simulation'
import type { StoreSnapshot } from '../state/store'

export interface PlanComparisonProps {
  readonly scenario: ReadonlyScenario
  readonly snapshot: StoreSnapshot
  readonly comparison: PlanComparisonResult | null
  readonly selectedPlanIds: readonly PlanId[]
  readonly candidatePlanId: PlanId
  readonly running: boolean
  readonly error?: { readonly code: string; readonly message: string } | null
  readonly onTogglePlan: (planId: PlanId) => void
  readonly onSelectCandidate: (planId: PlanId) => void
  readonly onRunComparison: () => void
  readonly onStagePlan: () => void
}

const statusText = (
  simulation: SimulationResult,
  committedPlanId: PlanId,
  activeProposal: StoreSnapshot['activeProposal'],
): { readonly label: string; readonly tone: string } => {
  if (activeProposal?.planId === simulation.planId) {
    if (activeProposal.status === 'review-requested') return { label: 'Review requested', tone: 'review' }
    if (activeProposal.status === 'stale') return { label: 'Staged, now stale', tone: 'stale' }
    return { label: 'Staged proposal', tone: 'staged' }
  }
  if (committedPlanId === simulation.planId) {
    return { label: 'Committed policy', tone: 'committed' }
  }
  return { label: 'Simulated', tone: 'simulated' }
}

const planStatusIcon = (tone: string) => {
  if (tone === 'stale') return <AlertTriangle size={14} aria-hidden="true" />
  if (tone === 'committed' || tone === 'staged' || tone === 'review') return <Check size={14} aria-hidden="true" />
  return <CircleHelp size={14} aria-hidden="true" />
}

export default function PlanComparison({
  scenario,
  snapshot,
  comparison,
  selectedPlanIds,
  candidatePlanId,
  running,
  error = null,
  onTogglePlan,
  onSelectCandidate,
  onRunComparison,
  onStagePlan,
}: PlanComparisonProps) {
  const invalidCount = selectedPlanIds.length < 2 || selectedPlanIds.length > 3
  const candidate = scenario.plans.find((plan) => plan.id === candidatePlanId)
  const selectedSimulation = comparison?.ranked.find((entry) => entry.planId === candidatePlanId)?.simulation ?? null
  const stageDisabled = selectedSimulation === null
    || !selectedSimulation.feasible
    || running
  const stageMessage = selectedSimulation === null
    ? 'Run this revision’s comparison before staging the candidate.'
    : !selectedSimulation.feasible
      ? `Cannot stage: first reserve breach at ${selectedSimulation.firstBreachIndex === null ? 'an unknown interval' : selectedSimulation.intervals[selectedSimulation.firstBreachIndex]?.label ?? 'an unknown interval'}.`
      : 'Only a current, feasible cached simulation can be staged.'

  return (
    <section className="comparison-section" aria-labelledby="comparison-heading">
      <div className="section-heading comparison-heading-row">
        <div>
          <p className="eyebrow">Decision set</p>
          <h2 id="comparison-heading">Plan comparison</h2>
        </div>
        <div className="comparison-heading-action">
          <span className="section-note">Ranked by reserve safety, coverage and closing charge.</span>
          <button className="button button--primary" type="button" onClick={onRunComparison} disabled={invalidCount || running}>
            <Play size={15} aria-hidden="true" />
            {running ? 'Comparing plans…' : 'Run comparison'}
          </button>
        </div>
      </div>

      <div className="comparison-controls">
        <fieldset className="plan-picker">
          <legend>Plans to compare</legend>
          <p className="field-help">Select exactly 2 or 3 named presets.</p>
          <div className="plan-picker-list">
            {scenario.plans.map((plan) => {
              const checked = selectedPlanIds.includes(plan.id)
              return (
                <label className={`plan-picker-option${checked ? ' plan-picker-option--selected' : ''}`} key={plan.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onTogglePlan(plan.id)}
                    aria-label={`Compare ${plan.name}`}
                  />
                  <span className="control-check" aria-hidden="true"><Check size={13} /></span>
                  <span>
                    <strong>{plan.name}</strong>
                    <small>{plan.description}</small>
                  </span>
                </label>
              )
            })}
          </div>
          {invalidCount && (
            <p className="inline-feedback inline-feedback--error" role="alert">
              Choose exactly 2 or 3 plans before running a comparison.
            </p>
          )}
        </fieldset>

        <fieldset className="candidate-picker">
          <legend>Candidate preset</legend>
          <p className="field-help">Use a named preset to update the read-only load matrix.</p>
          <div className="candidate-picker-list">
            {scenario.plans.map((plan) => (
              <label className={`candidate-option${candidatePlanId === plan.id ? ' candidate-option--selected' : ''}`} key={plan.id}>
                <input
                  type="radio"
                  name="wattkeep-candidate"
                  value={plan.id}
                  checked={candidatePlanId === plan.id}
                  onChange={() => onSelectCandidate(plan.id)}
                  aria-label={`Use ${plan.name} as candidate`}
                />
                <span className="control-radio" aria-hidden="true" />
                <span>{plan.name}</span>
              </label>
            ))}
          </div>
          <p className="candidate-description">{candidate?.description}</p>
        </fieldset>
      </div>

      {error !== null && (
        <div className="inline-feedback inline-feedback--error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span><strong>{error.code}</strong>: {error.message}</span>
        </div>
      )}

      <div className="comparison-result-bar">
        <div>
          <span className="status-label">Selected candidate</span>
          <strong>{candidate?.name ?? 'No preset selected'}</strong>
        </div>
        <div className="stage-control">
          <p className="stage-note" id="stage-note">{stageMessage}</p>
          <button className="button button--secondary" type="button" onClick={onStagePlan} aria-describedby="stage-note" disabled={stageDisabled}>
          <ArrowRight size={15} aria-hidden="true" />
          Stage selected plan
          </button>
        </div>
      </div>

      {comparison === null ? (
        <div className="empty-state empty-state--comparison">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h3>No comparison in this revision</h3>
            <p>Run the selected plans to see a deterministic ranking and choose a feasible candidate.</p>
          </div>
        </div>
      ) : (
        <div className="plan-results" role="region" aria-label="Ranked plan results">
          {comparison.ranked.map((ranked) => {
            const status = statusText(
              ranked.simulation,
              snapshot.committedPolicy.planId,
              snapshot.activeProposal,
            )
            const breach = ranked.simulation.firstBreachIndex === null
              ? null
              : ranked.simulation.intervals[ranked.simulation.firstBreachIndex]
            const selected = ranked.planId === candidatePlanId
            return (
              <article className={`plan-card${selected ? ' plan-card--selected' : ''}`} key={ranked.planId}>
                <div className="plan-card-topline">
                  <span className="plan-rank">Rank {ranked.rank}</span>
                  <span className={`plan-status plan-status--${status.tone}`}>
                    {planStatusIcon(status.tone)}
                    {status.label}
                  </span>
                </div>
                <div className="plan-card-title-row">
                  <div>
                    <h3>{ranked.planName}</h3>
                    <p>{scenario.plans.find((plan) => plan.id === ranked.planId)?.description}</p>
                  </div>
                  <button
                    className="button button--text"
                    type="button"
                    onClick={() => onSelectCandidate(ranked.planId)}
                    aria-pressed={selected}
                  >
                    {selected ? 'Candidate selected' : 'Use as candidate'}
                  </button>
                </div>

                <dl className="plan-metrics">
                  <div><dt>Feasibility</dt><dd>{ranked.simulation.feasible ? 'Feasible' : 'Reserve breach'}</dd></div>
                  <div><dt>Coverage</dt><dd>{formatPercent(ranked.simulation.coverage)}</dd></div>
                  <div><dt>End energy</dt><dd>{formatEnergy(ranked.simulation.endEnergyKWh)}</dd></div>
                  <div><dt>End charge</dt><dd>{formatPercent(ranked.simulation.endChargePercent)}</dd></div>
                </dl>

                <div className={`plan-breach${breach === null ? ' plan-breach--safe' : ''}`}>
                  {breach === null ? <ShieldCheck size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                  <span>{breach === null ? 'No reserve breach' : `First reserve breach: ${breach.label}`}</span>
                </div>
                <p className="plan-reason"><strong>Why this rank:</strong> {ranked.tradeOffReason}</p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
