import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  FileDiff,
  LockKeyhole,
  MessageSquareWarning,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { formatEnergy, formatPercent, formatPower } from '../domain/scenario'
import type { LoadId } from '../domain/types'
import type { CommitResult, CommitCapability, DiscardResult, Proposal, WattKeepStore } from '../state/store'
import type { RecoverableError } from '../domain/outcomes'

export interface ProposalDeskProps {
  readonly store: WattKeepStore
  readonly restaging?: boolean
  readonly onLiveMessage?: (message: string) => void
  readonly onCommitted?: (result: CommitResult) => void
  readonly onDiscarded?: (result: DiscardResult) => void
  readonly onRestage?: () => void
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const eventName = (status: Proposal['status']): string => {
  if (status === 'review-requested') return 'Review requested'
  if (status === 'stale') return 'Stale proposal'
  return 'Staged for review'
}

const policyLoads = (proposal: Proposal, policy: Proposal['beforePolicy']): string => {
  const simulationLoads = proposal.simulation.intervals.flatMap((interval) => interval.activeLoads)
  const names = new Set<LoadId>(simulationLoads.map((load) => load.loadId))
  // The policy is authoritative for the before/after diff. The simulation
  // load set above is only used as a safe fallback for old persisted proposals.
  return policy.loadIds.length === 0
    ? (names.size === 0 ? 'None' : [...names].join(', '))
    : policy.loadIds.map((loadId) => {
      const load = simulationLoads.find((candidate) => candidate.loadId === loadId)
      return load?.name ?? loadId
    }).filter((name, index, values) => values.indexOf(name) === index).join(', ')
}

export default function ProposalDesk({
  store,
  restaging = false,
  onLiveMessage,
  onCommitted,
  onDiscarded,
  onRestage,
}: ProposalDeskProps) {
  const liveSnapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const proposal = liveSnapshot.activeProposal
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProposal, setDialogProposal] = useState<Proposal | null>(null)
  const [capability, setCapability] = useState<CommitCapability | null>(null)
  const [dialogError, setDialogError] = useState<RecoverableError | null>(null)
  const [committing, setCommitting] = useState(false)
  const [committedSummary, setCommittedSummary] = useState<CommitResult | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const invokerRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const staleAlertRef = useRef<HTMLParagraphElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const errorRef = useRef<HTMLParagraphElement | null>(null)
  const committedSummaryRef = useRef<HTMLDivElement | null>(null)
  const dialogTarget = proposal ?? dialogProposal
  const capabilityCurrent = capability !== null
    && dialogTarget !== null
    && dialogTarget.proposalId === capability.proposalId
    && dialogTarget.status === 'review-requested'

  const report = (message: string): void => {
    onLiveMessage?.(message)
  }

  const closeDialog = (focusTarget: 'invoker' | 'comparison' | 'none' = 'invoker'): void => {
    setDialogOpen(false)
    setDialogProposal(null)
    setCapability(null)
    setDialogError(null)
    setCommitting(false)
    if (focusTarget === 'comparison') {
      window.setTimeout(() => {
        document.getElementById('comparison-heading')?.focus()
      }, 0)
      return
    }
    if (focusTarget === 'invoker') {
      window.setTimeout(() => invokerRef.current?.focus(), 0)
    }
  }

  useEffect(() => {
    if (!dialogOpen) return
    if (dialogTarget?.status === 'stale') {
      staleAlertRef.current?.focus()
      return
    }
    cancelRef.current?.focus()
  }, [dialogOpen, dialogTarget?.status])

  useEffect(() => {
    if (committedSummary !== null) {
      committedSummaryRef.current?.focus()
    }
  }, [committedSummary])

  const openCommitDialog = (event: React.MouseEvent<HTMLButtonElement>): void => {
    invokerRef.current = event.currentTarget
    if (proposal === null) {
      const message = 'Stage and review a proposal before opening commit confirmation.'
      report(message)
      setDialogError({ code: 'NO_PROPOSAL', message, nextActions: ['Stage a feasible plan first.'] })
      errorRef.current?.focus()
      return
    }

    const outcome = store.human.createCommitCapability(proposal.proposalId)
    if (!outcome.ok) {
      setDialogError(outcome.error)
      report(`${outcome.error.code}: ${outcome.error.message}`)
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }

    setDialogError(null)
    setCapability(outcome.data)
    setDialogProposal(proposal)
    setDialogOpen(true)
  }

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      report('Commit confirmation cancelled. The proposal remains staged for review.')
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (dialog === null) return
    const focusables = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const confirmCommit = (): void => {
    if (committing || !capabilityCurrent || capability === null || dialogTarget === null) return
    setCommitting(true)
    const outcome = store.human.commit(capability)
    setCommitting(false)
    if (!outcome.ok) {
      setDialogError(outcome.error)
      report(`${outcome.error.code}: ${outcome.error.message}`)
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }

    setDialogError(null)
    setCommittedSummary(outcome.data)
    closeDialog('none')
    report(store.getSnapshot().persistenceMode === 'memory-only'
      ? `Commit recorded for ${outcome.data.afterPolicy.planName} in memory. This session is not persisted.`
      : `Commit recorded for ${outcome.data.afterPolicy.planName} at revision ${outcome.data.revision}.`)
    onCommitted?.(outcome.data)
  }

  const discardProposal = (): void => {
    if (dialogTarget === null || discarding) return
    setDiscarding(true)
    const outcome = store.agent.discardPlan(dialogTarget.proposalId)
    setDiscarding(false)
    if (!outcome.ok) {
      setDialogError(outcome.error)
      report(`${outcome.error.code}: ${outcome.error.message}`)
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }
    setCommittedSummary(null)
    closeDialog('comparison')
    report('The proposal was discarded. No household policy changed.')
    onDiscarded?.(outcome.data)
  }

  return (
    <section className="proposal-section" aria-labelledby="proposal-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Human checkpoint</p>
          <h2 id="proposal-heading">Proposal desk</h2>
        </div>
        <LockKeyhole size={18} aria-label="Human approval required" />
      </div>

      {proposal === null ? (
        <div className="empty-state empty-state--proposal">
          <FileDiff size={21} aria-hidden="true" />
          <div>
            <h3>No active proposal</h3>
            <p>Stage a feasible simulation to create an immutable before-and-after diff for review.</p>
          </div>
        </div>
      ) : (
        <div className="proposal-content">
          <div className="proposal-banner">
            <div>
              <span className="status-label">Active proposal</span>
              <h3>{proposal.planName}</h3>
              <p>{proposal.simulation.feasible ? 'Feasible under the current reserve target.' : 'This simulation breaches reserve and cannot be committed.'}</p>
            </div>
            <span className={`proposal-status proposal-status--${proposal.status}`}>
              {proposal.status === 'stale' ? <AlertTriangle size={14} aria-hidden="true" /> : <ClipboardCheck size={14} aria-hidden="true" />}
              {eventName(proposal.status)}
            </span>
          </div>

          <div className="proposal-grid">
            <div className="proposal-column proposal-column--before">
              <p className="panel-kicker">Before</p>
              <h3>{proposal.beforePolicy.planName}</h3>
              <p>{proposal.beforePolicy.description}</p>
              <dl className="proposal-facts">
                <div><dt>Loads</dt><dd>{policyLoads(proposal, proposal.beforePolicy)}</dd></div>
                <div><dt>Reserve</dt><dd>{formatEnergy(proposal.assumptions.reserveKWh)}</dd></div>
                <div><dt>Base revision</dt><dd>r{proposal.baseRevision}</dd></div>
              </dl>
            </div>
            <div className="proposal-arrow" aria-hidden="true">→</div>
            <div className="proposal-column proposal-column--after">
              <p className="panel-kicker">After human commit</p>
              <h3>{proposal.afterPolicy.planName}</h3>
              <p>{proposal.afterPolicy.description}</p>
              <dl className="proposal-facts">
                <div><dt>Loads</dt><dd>{policyLoads(proposal, proposal.afterPolicy)}</dd></div>
                <div><dt>Reserve</dt><dd>{formatEnergy(proposal.assumptions.reserveKWh)}</dd></div>
                <div><dt>Current revision</dt><dd>r{proposal.currentRevision}</dd></div>
              </dl>
            </div>
          </div>

          <div className="proposal-assumptions">
            <div><span className="status-label">Battery assumption</span><strong>{formatEnergy(proposal.assumptions.battery.startEnergyKWh)} at {formatPercent(proposal.assumptions.battery.startChargePercent)}</strong></div>
            <div><span className="status-label">Outage assumption</span><strong>{proposal.assumptions.outage.start} to {proposal.assumptions.outage.end}</strong></div>
            <div><span className="status-label">Simulation result</span><strong>{formatEnergy(proposal.simulation.endEnergyKWh)} at {formatPercent(proposal.simulation.endChargePercent)}</strong></div>
            <div><span className="status-label">Plan draw</span><strong>{formatPower(proposal.simulation.totalLoadKWh / proposal.assumptions.outage.intervalCount)} average</strong></div>
          </div>

          {dialogError !== null && !dialogOpen && (
            <p className="inline-feedback inline-feedback--error" role="alert" ref={errorRef} tabIndex={-1}>
              <MessageSquareWarning size={16} aria-hidden="true" />
              <span><strong>{dialogError.code}</strong>: {dialogError.message}</span>
            </p>
          )}

          <div className="proposal-actions">
            {proposal.status === 'staged' && (
              <button className="button button--secondary" type="button" onClick={() => {
                const outcome = store.agent.requestReview(proposal.proposalId)
                if (!outcome.ok) {
                  setDialogError(outcome.error)
                  report(`${outcome.error.code}: ${outcome.error.message}`)
                  return
                }
                setDialogError(null)
                report('Review requested. A human can now open commit confirmation.')
              }}>
                <ClipboardCheck size={15} aria-hidden="true" />
                Request review
              </button>
            )}
            {proposal.status === 'review-requested' && (
              <button className="button button--primary" type="button" onClick={openCommitDialog}>
                <LockKeyhole size={15} aria-hidden="true" />
                Review and commit
              </button>
            )}
            {proposal.status === 'stale' && !dialogOpen && (
              <>
                <p className="stale-copy">This proposal is stale because the workspace revision changed from r{proposal.baseRevision} to r{liveSnapshot.workspaceRevision}. Proposal ID: {proposal.proposalId}. Restage it with this exact ID or discard it.</p>
                <button className="button button--secondary" type="button" disabled={restaging} onClick={() => {
                  onRestage?.()
                  report(`Restage requested for proposal ${proposal.proposalId}.`)
                }}>
                  <ClipboardCheck size={15} aria-hidden="true" />
                  {restaging ? 'Restaging proposal…' : 'Restage exact proposal'}
                </button>
              </>
            )}
            {!dialogOpen && (
              <button className="button button--danger-quiet" type="button" onClick={discardProposal} disabled={discarding}>
                <X size={15} aria-hidden="true" />
                {discarding ? 'Discarding…' : 'Discard proposal'}
              </button>
            )}
          </div>
        </div>
      )}

      {committedSummary !== null && (
        <div className="commit-summary" role="status" tabIndex={-1} ref={committedSummaryRef}>
          <Check size={18} aria-hidden="true" />
          <div>
            <strong>Committed {committedSummary.afterPolicy.planName}</strong>
            <span>Revision r{committedSummary.revision}. The active proposal is closed.</span>
            {liveSnapshot.persistenceMode === 'memory-only' && (
              <span className="summary-warning">Memory-only session: the commit is successful in this session, but not persisted to storage.</span>
            )}
          </div>
        </div>
      )}

      {dialogOpen && dialogTarget !== null && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog()
            report('Commit confirmation cancelled. The proposal remains staged for review.')
          }
        }}>
          <div
            className="commit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commit-dialog-heading"
            aria-describedby="commit-dialog-description"
            ref={dialogRef}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="dialog-heading">
              <div>
                <p className="panel-kicker">Human approval required</p>
                <h2 id="commit-dialog-heading">Review and commit {dialogTarget.planName}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close commit confirmation" onClick={() => closeDialog()}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p id="commit-dialog-description" className="dialog-description">This applies the staged load policy to this local planning session. The agent cannot approve it.</p>

            {dialogTarget.status === 'stale' ? (
              <p className="dialog-alert" role="alert" tabIndex={-1} ref={staleAlertRef}>
                <AlertTriangle size={17} aria-hidden="true" />
                <span><strong>STALE_PROPOSAL</strong>: The workspace changed while this confirmation was open. Proposal ID: {dialogTarget.proposalId}. Confirm is disabled until this exact proposal is restaged.</span>
              </p>
            ) : dialogError !== null ? (
              <p className="dialog-alert" role="alert" tabIndex={-1} ref={errorRef}>
                <MessageSquareWarning size={17} aria-hidden="true" />
                <span><strong>{dialogError.code}</strong>: {dialogError.message}</span>
              </p>
            ) : (
              <div className="dialog-diff" aria-label="Commit summary">
                <div><span>Current policy</span><strong>{dialogTarget.beforePolicy.planName}</strong></div>
                <div><span>New policy</span><strong>{dialogTarget.afterPolicy.planName}</strong></div>
                <div><span>Reserve target</span><strong>{formatEnergy(dialogTarget.assumptions.reserveKWh)}</strong></div>
                <div><span>Workspace revision</span><strong>r{dialogTarget.baseRevision} to r{dialogTarget.baseRevision + 1}</strong></div>
              </div>
            )}

            {dialogTarget.status === 'stale' && (
              <div className="dialog-recovery-actions">
                <button className="button button--secondary" type="button" disabled={restaging} onClick={() => {
                  onRestage?.()
                  report(`Restage requested for proposal ${dialogTarget.proposalId}.`)
                  closeDialog('comparison')
                }}>
                  {restaging ? 'Restaging proposal…' : 'Restage exact proposal'}
                </button>
                <button className="button button--danger-quiet" type="button" onClick={discardProposal}>
                  Discard proposal
                </button>
              </div>
            )}

            <div className="dialog-actions">
              <button className="button button--quiet" type="button" ref={cancelRef} onClick={() => {
                closeDialog()
                report('Commit confirmation cancelled. The proposal remains staged for review.')
              }}>
                Cancel
              </button>
              <button className="button button--primary" type="button" onClick={confirmCommit} disabled={committing || !capabilityCurrent}>
                <LockKeyhole size={15} aria-hidden="true" />
                {committing ? 'Committing…' : 'Confirm commit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
