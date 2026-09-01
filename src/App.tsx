import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BatteryCharging, CircleCheck, Command, Zap } from 'lucide-react'

import type { IntervalExplanation, PlanComparison, SimulationResult } from './domain/simulation'
import { PLAN_IDS_IN_ORDER } from './domain/scenario'
import type { PlanId } from './domain/types'
import type { RecoverableError } from './domain/outcomes'
import EnergyStatus from './components/EnergyStatus'
import LoadPriorities from './components/LoadPriorities'
import OperationJournal from './components/OperationJournal'
import OutageTimeline from './components/OutageTimeline'
import PlanComparisonView from './components/PlanComparison'
import ProposalDesk from './components/ProposalDesk'
import { store as defaultStore, type StoreSnapshot, type WattKeepStore } from './state/store'
import type { ModelContext } from './webmcp/model-context'
import { registerWebMcpTools, type WebMcpRegistration } from './webmcp/register-tools'

export interface AppProps {
  readonly store?: WattKeepStore
  readonly webMcpTarget?: Document | ModelContext | null
}

type WebMcpStatus =
  | { readonly state: 'checking' }
  | { readonly state: 'webmcp'; readonly registration: WebMcpRegistration }
  | { readonly state: 'manual'; readonly reason: string }

const defaultWebMcpTarget = (): Document | null => (
  typeof document === 'undefined' ? null : document
)

const samePlanIds = (
  left: readonly PlanId[],
  right: readonly PlanId[],
): boolean => left.length === right.length && left.every((planId, index) => planId === right[index])

const currentComparison = (
  snapshot: StoreSnapshot,
  planIds: readonly PlanId[],
): PlanComparison | null => {
  const match = [...snapshot.comparisons].reverse().find((entry) => (
    entry.sessionEpoch === snapshot.sessionEpoch
    && entry.workspaceRevision === snapshot.workspaceRevision
    && samePlanIds(entry.comparison.requestedPlanIds, planIds)
  ))
  return match?.comparison ?? null
}

const currentSimulation = (
  snapshot: StoreSnapshot,
  planId: PlanId,
): SimulationResult | null => {
  const match = [...snapshot.simulations].reverse().find((entry) => (
    entry.sessionEpoch === snapshot.sessionEpoch
    && entry.workspaceRevision === snapshot.workspaceRevision
    && entry.result.planId === planId
  ))
  return match?.result ?? null
}

const currentExplanation = (
  snapshot: StoreSnapshot,
  simulationId: string | null,
  intervalIndex: number | null,
): IntervalExplanation | null => {
  if (simulationId === null || intervalIndex === null) return null
  const match = [...snapshot.explanations].reverse().find((entry) => (
    entry.sessionEpoch === snapshot.sessionEpoch
    && entry.workspaceRevision === snapshot.workspaceRevision
    && entry.simulationId === simulationId
    && entry.intervalIndex === intervalIndex
  ))
  return match?.explanation ?? null
}

const formatError = (error: RecoverableError): { readonly code: string; readonly message: string } => ({
  code: error.code,
  message: error.message,
})

function App({
  store = defaultStore,
  webMcpTarget,
}: AppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const resolvedWebMcpTarget = webMcpTarget === undefined ? defaultWebMcpTarget() : webMcpTarget
  const [webmcpStatus, setWebmcpStatus] = useState<WebMcpStatus>({ state: 'checking' })
  const [selectedPlanIds, setSelectedPlanIds] = useState<readonly PlanId[]>(PLAN_IDS_IN_ORDER)
  const [candidatePlanId, setCandidatePlanId] = useState<PlanId>('balanced-night')
  const [selectedInterval, setSelectedInterval] = useState<number | null>(null)
  const [runningAction, setRunningAction] = useState<'comparison' | 'restage' | null>(null)
  const [interactionError, setInteractionError] = useState<{ readonly code: string; readonly message: string } | null>(null)
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState('WattKeep ready for a local outage plan.')
  const seenComparisonRecordsRef = useRef<Set<string>>(new Set())
  const seenExplanationRecordsRef = useRef<Set<string>>(new Set())
  const [resetOpen, setResetOpen] = useState(false)
  const resetCancelRef = useRef<HTMLButtonElement | null>(null)
  const resetDialogRef = useRef<HTMLDivElement | null>(null)
  const resetInvokerRef = useRef<HTMLButtonElement | null>(null)
  const statusHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const announce = useCallback((message: string): void => {
    setLiveMessage(message)
  }, [])

  useEffect(() => {
    const lifecycle = new AbortController()
    let disposed = false
    let registration: WebMcpRegistration | undefined

    void registerWebMcpTools(resolvedWebMcpTarget, store, lifecycle.signal).then((result) => {
      if (disposed) {
        result.cleanup()
        return
      }
      registration = result
      if (result.mode === 'webmcp') {
        setWebmcpStatus({ state: 'webmcp', registration: result })
      } else {
        setWebmcpStatus({ state: 'manual', reason: result.reason ?? 'Use the manual interface.' })
      }
    })

    return () => {
      disposed = true
      lifecycle.abort()
      registration?.cleanup()
    }
  }, [resolvedWebMcpTarget, store])

  useEffect(() => {
    const currentRecords = snapshot.comparisons.filter((entry) => (
      entry.sessionEpoch === snapshot.sessionEpoch
      && entry.workspaceRevision === snapshot.workspaceRevision
    ))
    const unseenRecords = currentRecords.filter((entry) => {
      const key = `${entry.sessionEpoch}:${entry.workspaceRevision}:${entry.comparisonId}`
      return !seenComparisonRecordsRef.current.has(key)
    })
    if (unseenRecords.length === 0) return

    unseenRecords.forEach((entry) => {
      seenComparisonRecordsRef.current.add(
        `${entry.sessionEpoch}:${entry.workspaceRevision}:${entry.comparisonId}`,
      )
    })
    const latest = unseenRecords[unseenRecords.length - 1]
    setSelectedPlanIds(latest.comparison.requestedPlanIds)
  }, [snapshot])

  useEffect(() => {
    const currentRecords = snapshot.explanations.filter((entry) => (
      entry.sessionEpoch === snapshot.sessionEpoch
      && entry.workspaceRevision === snapshot.workspaceRevision
    ))
    const unseenRecords = currentRecords.filter((entry) => {
      const key = `${entry.sessionEpoch}:${entry.workspaceRevision}:${entry.explanationId}`
      return !seenExplanationRecordsRef.current.has(key)
    })
    if (unseenRecords.length === 0) return

    unseenRecords.forEach((entry) => {
      seenExplanationRecordsRef.current.add(
        `${entry.sessionEpoch}:${entry.workspaceRevision}:${entry.explanationId}`,
      )
    })
    const latest = unseenRecords[unseenRecords.length - 1]
    const simulationEntry = snapshot.simulations.find((entry) => (
      entry.simulationId === latest.simulationId
      && entry.sessionEpoch === snapshot.sessionEpoch
      && entry.workspaceRevision === snapshot.workspaceRevision
    ))
    if (simulationEntry === undefined) return

    setCandidatePlanId(simulationEntry.result.planId)
    setSelectedInterval(latest.intervalIndex)
    setExplanationError(null)
  }, [snapshot])

  useEffect(() => {
    if (!resetOpen) return
    resetCancelRef.current?.focus()
  }, [resetOpen])

  const comparison = useMemo(
    () => currentComparison(snapshot, selectedPlanIds),
    [selectedPlanIds, snapshot],
  )
  const simulation = useMemo(
    () => currentSimulation(snapshot, candidatePlanId),
    [candidatePlanId, snapshot],
  )
  const explanation = useMemo(
    () => currentExplanation(snapshot, simulation?.simulationId ?? null, selectedInterval),
    [selectedInterval, simulation?.simulationId, snapshot],
  )

  const runComparison = async (): Promise<void> => {
    if (selectedPlanIds.length < 2 || selectedPlanIds.length > 3) {
      const message = 'Choose exactly 2 or 3 plans before running a comparison.'
      setInteractionError({ code: 'INVALID_PLAN_COUNT', message })
      announce(message)
      return
    }

    setRunningAction('comparison')
    setInteractionError(null)
    setExplanationError(null)
    try {
      const outcome = await store.agent.comparePlans({
        planIds: selectedPlanIds,
        sessionEpoch: snapshot.sessionEpoch,
      })
      if (!outcome.ok) {
        setInteractionError(formatError(outcome.error))
        announce(`${outcome.error.code}: ${outcome.error.message}`)
        return
      }
      setInteractionError(null)
      announce(`Comparison complete. ${outcome.data.ranked[0]?.planName ?? 'No plan'} ranks first for reserve safety.`)
    } catch {
      const message = 'The comparison could not be completed safely. Retry the operation.'
      setInteractionError({ code: 'INTERNAL_ERROR', message })
      announce(message)
    } finally {
      setRunningAction(null)
    }
  }

  const stageSelectedPlan = (): void => {
    if (simulation === null) {
      const message = 'Run a comparison for the selected candidate before staging it.'
      setInteractionError({ code: 'UNKNOWN_SIMULATION', message })
      announce(message)
      return
    }

    const outcome = store.agent.stagePlan({
      simulationId: simulation.simulationId,
      simulationFingerprint: simulation.fingerprint,
      planId: simulation.planId,
      scenarioId: simulation.scenarioId,
      workspaceRevision: snapshot.workspaceRevision,
      sessionEpoch: snapshot.sessionEpoch,
    })
    if (!outcome.ok) {
      setInteractionError(formatError(outcome.error))
      announce(`${outcome.error.code}: ${outcome.error.message}`)
      return
    }
    setInteractionError(null)
    announce(`${outcome.data.planName} staged at revision ${outcome.data.baseRevision}. Review the proposal before committing.`)
  }

  const restageProposal = async (): Promise<void> => {
    const active = store.getSnapshot().activeProposal
    if (active === null) {
      announce('There is no active proposal to restage.')
      return
    }

    setRunningAction('restage')
    setInteractionError(null)
    try {
      const simulated = await store.agent.simulatePlan({
        planId: active.planId,
        sessionEpoch: store.getSnapshot().sessionEpoch,
      })
      if (!simulated.ok) {
        setInteractionError(formatError(simulated.error))
        announce(`${simulated.error.code}: ${simulated.error.message}`)
        return
      }
      const staged = store.agent.stagePlan({
        simulationId: simulated.data.simulationId,
        simulationFingerprint: simulated.data.fingerprint,
        planId: simulated.data.planId,
        scenarioId: simulated.data.scenarioId,
        workspaceRevision: store.getSnapshot().workspaceRevision,
        sessionEpoch: store.getSnapshot().sessionEpoch,
        replaceProposalId: active.proposalId,
      })
      if (!staged.ok) {
        setInteractionError(formatError(staged.error))
        announce(`${staged.error.code}: ${staged.error.message}`)
        return
      }
      setInteractionError(null)
      announce(`${staged.data.planName} was restaged with proposal ${staged.data.proposalId}. Request review again before committing.`)
    } catch {
      const message = 'The proposal could not be restaged safely. Retry the operation.'
      setInteractionError({ code: 'INTERNAL_ERROR', message })
      announce(message)
    } finally {
      setRunningAction(null)
    }
  }

  const explainSelectedInterval = async (intervalIndex: number): Promise<void> => {
    setSelectedInterval(intervalIndex)
    setExplanationError(null)
    if (simulation === null) {
      const message = 'Run a plan comparison before requesting interval evidence.'
      setExplanationError(message)
      announce(message)
      return
    }

    const outcome = await store.agent.explainInterval({
      simulationId: simulation.simulationId,
      intervalIndex,
      sessionEpoch: snapshot.sessionEpoch,
    })
    if (!outcome.ok) {
      const message = `${outcome.error.code}: ${outcome.error.message}`
      setExplanationError(message)
      announce(message)
      return
    }
    setExplanationError(null)
    announce(`Interval evidence ready for ${outcome.data.label}.`)
  }

  const refreshForecast = (): void => {
    const outcome = store.human.refreshForecast()
    if (!outcome.ok) {
      setInteractionError(formatError(outcome.error))
      announce(`${outcome.error.code}: ${outcome.error.message}`)
      return
    }
    setInteractionError(null)
    if (outcome.data.alreadyRefreshed) {
      announce('The updated forecast is already active. Current proposal status is unchanged.')
    } else {
      announce(outcome.data.proposal === null
        ? 'Forecast refreshed to a new revision. Cached simulations must be rerun.'
        : 'Forecast refreshed. The active proposal is now stale and cannot be committed until restaged.')
    }
  }

  const undoLatest = (): void => {
    const outcome = store.human.undo()
    if (!outcome.ok) {
      setInteractionError(formatError(outcome.error))
      announce(`${outcome.error.code}: ${outcome.error.message}`)
      return
    }
    setInteractionError(null)
    announce(`Undo completed. ${outcome.data.afterPolicy.planName} is restored as revision ${outcome.data.revision}.`)
  }

  const openReset = (): void => {
    const activeElement = document.activeElement
    resetInvokerRef.current = activeElement instanceof HTMLButtonElement ? activeElement : null
    setResetOpen(true)
  }

  const closeReset = (announceCancellation = false): void => {
    setResetOpen(false)
    if (announceCancellation) {
      announce('Reset cancelled. Current session unchanged.')
    }
    window.setTimeout(() => resetInvokerRef.current?.focus(), 0)
  }

  const handleResetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeReset(true)
      return
    }
    if (event.key !== 'Tab') return

    const dialog = resetDialogRef.current
    if (dialog === null) return
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled])')]
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

  const confirmReset = (): void => {
    const outcome = store.human.reset()
    if (!outcome.ok) {
      setInteractionError(formatError(outcome.error))
      announce(`${outcome.error.code}: ${outcome.error.message}`)
      return
    }
    setResetOpen(false)
    setSelectedPlanIds(PLAN_IDS_IN_ORDER)
    setCandidatePlanId('balanced-night')
    setSelectedInterval(null)
    setInteractionError(null)
    setExplanationError(null)
    announce(`Session reset complete. Session ${outcome.data.sessionEpoch} starts at revision 1; the previous journal was archived.`)
    window.setTimeout(() => statusHeadingRef.current?.focus(), 0)
  }

  const webmcpLabel = webmcpStatus.state === 'checking'
    ? 'Checking WebMCP availability'
    : webmcpStatus.state === 'webmcp'
      ? 'WebMCP tools registered'
      : 'Manual interface active'

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="WattKeep home">
          <span className="brand-mark" aria-hidden="true"><Zap size={17} strokeWidth={1.8} /></span>
          <span>WattKeep</span>
        </a>
        <div className="topbar-status">
          <span className="mode-label"><span className="status-dot" aria-hidden="true" />Local planning mode</span>
          <span className={`tool-status tool-status--${webmcpStatus.state}`} role="status">
            <Command size={14} aria-hidden="true" />
            {webmcpLabel}
          </span>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Outage resilience planner</p>
        <h1 id="page-title">Make stored energy last.</h1>
        <p className="intro-copy">Inspect the household, compare transparent energy plans, then decide what must stay powered through the night.</p>
        <div className="webmcp-note" role="status" aria-live="polite">
          <BatteryCharging size={15} aria-hidden="true" />
          <span>{webmcpStatus.state === 'manual' ? webmcpStatus.reason : webmcpStatus.state === 'webmcp' ? `Eight page tools ready: ${webmcpStatus.registration.toolNames.join(', ')}.` : 'Checking the page-scoped planning tools.'}</span>
        </div>
      </section>

      <EnergyStatus
        snapshot={snapshot}
        onRefresh={refreshForecast}
        onUndo={undoLatest}
        onReset={openReset}
        headingRef={statusHeadingRef}
      />

      <div className="workspace-grid">
        <PlanComparisonView
          scenario={snapshot.scenario}
          snapshot={snapshot}
          comparison={comparison}
          selectedPlanIds={selectedPlanIds}
          candidatePlanId={candidatePlanId}
          running={runningAction === 'comparison'}
          error={interactionError}
          onTogglePlan={(planId) => {
            setSelectedPlanIds((current) => current.includes(planId)
              ? current.filter((selected) => selected !== planId)
              : [...current, planId])
            setInteractionError(null)
          }}
          onSelectCandidate={(planId) => {
            setCandidatePlanId(planId)
            setSelectedInterval(null)
            setExplanationError(null)
          }}
          onRunComparison={() => { void runComparison() }}
          onStagePlan={stageSelectedPlan}
        />

        <LoadPriorities
          scenario={snapshot.scenario}
          committedPolicy={snapshot.committedPolicy}
          candidatePlanId={candidatePlanId}
        />

        <OutageTimeline
          scenario={snapshot.scenario}
          simulation={simulation}
          selectedInterval={selectedInterval}
          explanation={explanation}
          explanationError={explanationError}
          onExplain={(intervalIndex) => { void explainSelectedInterval(intervalIndex) }}
        />

        <ProposalDesk
          store={store}
          onLiveMessage={announce}
          restaging={runningAction === 'restage'}
          onRestage={() => { void restageProposal() }}
          onCommitted={() => {
            setInteractionError(null)
          }}
          onDiscarded={() => {
            setInteractionError(null)
          }}
        />

        <OperationJournal snapshot={snapshot} />
      </div>

      <p className="live-message" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>

      {resetOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeReset(true)
        }}>
          <div className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-heading" aria-describedby="reset-dialog-description" ref={resetDialogRef} onKeyDown={handleResetKeyDown}>
            <div className="dialog-heading">
              <div>
                <p className="panel-kicker">Start a clean session</p>
                <h2 id="reset-dialog-heading">Reset WattKeep planning?</h2>
              </div>
              <CircleCheck size={19} aria-hidden="true" />
            </div>
            <p id="reset-dialog-description">
              {snapshot.activeProposal === null
                ? 'This starts a new session and archives the current journal.'
                : `Active proposal “${snapshot.activeProposal.planName}” will be archived with the current journal. No policy is committed by reset.`}
            </p>
            <div className="dialog-actions">
              <button className="button button--quiet" type="button" ref={resetCancelRef} onClick={() => closeReset(true)}>Cancel</button>
              <button className="button button--danger" type="button" onClick={confirmReset}>Reset session</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
