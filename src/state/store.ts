import {
  comparePlans as calculateComparison,
  explainInterval as calculateExplanation,
  simulatePlan as calculateSimulation,
  type IntervalExplanation,
  type PlanComparison,
  type SimulationResult,
} from '../domain/simulation'
import {
  getAlternateScenario,
  getScenario,
} from '../domain/scenario'
import {
  ERROR_CODES,
  failure,
  success,
  type Outcome,
} from '../domain/outcomes'
import type {
  Battery,
  LoadDefinition,
  LoadId,
  Outage,
  PlanId,
  PlanPreset,
  ReadonlyScenario,
} from '../domain/types'
import {
  clearPersistedState,
  PERSISTENCE_KEY,
  readPersistedState,
  resolveStorage,
  writePersistedState,
  type PersistenceIssue,
  type PersistenceMode,
  type PersistedStoreState,
  type StorageLike,
} from './persistence'

export type ForecastKind = 'canonical' | 'alternate'

export type ProposalStatus = 'staged' | 'review-requested' | 'stale'

export type JournalEvent =
  | 'session-reset'
  | 'proposal-staged'
  | 'review-requested'
  | 'forecast-refreshed'
  | 'stale-rejection'
  | 'proposal-discarded'
  | 'commit'
  | 'undo'

export interface LoadPolicy {
  readonly planId: PlanId
  readonly planName: string
  readonly description: string
  readonly loadIds: readonly LoadId[]
}

export interface LoadPolicyDiff {
  readonly before: LoadPolicy
  readonly after: LoadPolicy
  readonly addedLoadIds: readonly LoadId[]
  readonly removedLoadIds: readonly LoadId[]
  readonly unchangedLoadIds: readonly LoadId[]
  readonly changed: boolean
}

export interface ProposalAssumptions {
  readonly scenarioId: string
  readonly scenarioRevision: number
  readonly workspaceRevision: number
  readonly forecastKind: ForecastKind
  readonly battery: Battery
  readonly outage: Outage
  readonly solarKWh: readonly number[]
  readonly reserveKWh: number
}

export interface Proposal {
  readonly proposalId: string
  readonly id: string
  readonly status: ProposalStatus
  readonly baseRevision: number
  readonly currentRevision: number
  readonly simulationId: string
  readonly simulationFingerprint: string
  readonly fingerprint: string
  readonly scenarioId: string
  readonly planId: PlanId
  readonly planName: string
  readonly assumptions: ProposalAssumptions
  readonly simulation: SimulationResult
  readonly result: SimulationResult
  readonly beforePolicy: LoadPolicy
  readonly afterPolicy: LoadPolicy
  readonly before: LoadPolicy
  readonly after: LoadPolicy
  readonly diff: LoadPolicyDiff
}

export interface CommitRecord {
  readonly commitId: string
  readonly proposalId: string
  readonly revision: number
  readonly journalSequence: number
  readonly beforePolicy: LoadPolicy
  readonly afterPolicy: LoadPolicy
}

export interface ArchivedSnapshot {
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly forecastKind: ForecastKind
  readonly committedPolicy: LoadPolicy
  readonly activeProposal: Proposal | null
  readonly journal: readonly JournalEntry[]
}

export interface ArchivedSession {
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly forecastKind: ForecastKind
  readonly committedPolicy: LoadPolicy
  readonly activeProposal: Proposal | null
  readonly journal: readonly JournalEntry[]
  readonly snapshot: ArchivedSnapshot
}

export interface JournalEntry {
  readonly id: string
  readonly sequence: number
  readonly event: JournalEvent
  readonly type: JournalEvent
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly proposalId?: string
  readonly simulationId?: string
  readonly planId?: PlanId
  readonly status?: ProposalStatus
  readonly previousStatus?: ProposalStatus
  readonly beforeRevision?: number
  readonly afterRevision?: number
  readonly beforeForecast?: ForecastKind
  readonly afterForecast?: ForecastKind
  readonly beforePolicy?: LoadPolicy
  readonly afterPolicy?: LoadPolicy
  readonly staleProposalId?: string
  readonly replacedProposalId?: string
  readonly revertedCommitId?: string
  readonly archivedSessionEpoch?: number
  readonly [key: string]: unknown
}

export interface CachedSimulation {
  readonly simulationId: string
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly result: SimulationResult
  readonly simulation: SimulationResult
}

export interface CachedComparison {
  readonly comparisonId: string
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly comparison: PlanComparison
}

export interface CachedExplanation {
  readonly explanationId: string
  readonly simulationId: string
  readonly intervalIndex: number
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly explanation: IntervalExplanation
}

export interface ProposalSummary {
  readonly proposalId: string
  readonly status: ProposalStatus
  readonly baseRevision: number
  readonly currentRevision: number
  readonly planId: PlanId
}

export interface HomeLoad extends LoadDefinition {
  readonly committed: boolean
}

export interface HomeInspection {
  readonly household: ReadonlyScenario['household']
  readonly battery: ReadonlyScenario['battery']
  readonly reserveKWh: number
  readonly loads: readonly HomeLoad[]
  readonly plans: readonly PlanPreset[]
  readonly committedPolicy: LoadPolicy
  readonly workspaceRevision: number
  readonly sessionEpoch: number
  readonly forecastKind: ForecastKind
  readonly proposal: ProposalSummary | null
}

export interface OutageInspection {
  readonly outage: ReadonlyScenario['outage']
  readonly intervals: ReadonlyScenario['intervals']
  readonly solarKWh: readonly number[]
  readonly scenarioId: string
  readonly scenarioRevision: number
  readonly workspaceRevision: number
  readonly sessionEpoch: number
  readonly forecastKind: ForecastKind
}

export interface StagePlanInput {
  readonly simulationId: string
  readonly replaceProposalId?: string
  /** Optional identity fields let callers prove that a supplied cached result was not forged. */
  readonly simulationFingerprint?: string
  readonly fingerprint?: string
  readonly planId?: string
  readonly scenarioId?: string
  readonly workspaceRevision?: number
  readonly sessionEpoch?: number
  readonly epoch?: number
}

export interface InvocationContext {
  readonly sessionEpoch?: number
  readonly epoch?: number
  readonly invocationId?: string
}

export interface SimulatePlanInput extends InvocationContext {
  readonly planId: string
}

export interface ComparePlansInput extends InvocationContext {
  readonly planIds: readonly string[]
}

export interface ExplainIntervalInput extends InvocationContext {
  readonly simulationId: string
  readonly intervalIndex: number
}

export interface ProposalCommandInput extends InvocationContext {
  readonly proposalId: string
}

export interface ReviewResult {
  readonly proposal: Proposal
  readonly proposalId: string
  readonly baseRevision: number
  readonly currentRevision: number
}

export interface DiscardResult {
  readonly proposalId: string
  readonly alreadyDiscarded: boolean
  readonly activeProposal: null
}

export interface CommitResult {
  readonly commitId: string
  readonly proposalId: string
  readonly revision: number
  readonly beforePolicy: LoadPolicy
  readonly afterPolicy: LoadPolicy
}

export interface ForecastRefreshResult {
  readonly forecastKind: ForecastKind
  readonly previousForecastKind: ForecastKind
  readonly revision: number
  readonly previousRevision: number
  readonly proposal: Proposal | null
  readonly alreadyRefreshed: boolean
}

export interface UndoResult {
  readonly revertedCommitId: string
  readonly revision: number
  readonly beforePolicy: LoadPolicy
  readonly afterPolicy: LoadPolicy
}

export interface ResetResult {
  readonly sessionEpoch: number
  readonly revision: number
  readonly archivedSessionEpoch: number
  readonly archivedJournalLength: number
}

export interface StoreSnapshot {
  readonly schemaVersion: 1
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  /** Alias retained for consumers that call the workspace revision simply revision. */
  readonly revision: number
  readonly forecastKind: ForecastKind
  readonly scenario: ReadonlyScenario
  readonly currentScenario: ReadonlyScenario
  readonly forecast: ReadonlyScenario
  readonly currentForecast: ReadonlyScenario
  readonly committedPolicy: LoadPolicy
  readonly activeProposal: Proposal | null
  readonly simulations: readonly CachedSimulation[]
  readonly simulationCache: readonly CachedSimulation[]
  readonly comparisons: readonly CachedComparison[]
  readonly comparisonCache: readonly CachedComparison[]
  readonly explanations: readonly CachedExplanation[]
  readonly explanationCache: readonly CachedExplanation[]
  readonly journal: readonly JournalEntry[]
  readonly archivedSessions: readonly ArchivedSession[]
  readonly persistenceMode: PersistenceMode
  readonly persistenceIssue: PersistenceIssue | null
  readonly lastCommit: CommitRecord | null
  readonly undoAvailable: boolean
}

export type Snapshot = StoreSnapshot

export interface CommitCapability {
  readonly sessionEpoch: number
  readonly epoch: number
  readonly proposalId: string
  readonly baseRevision: number
  readonly status: 'review-requested'
}

export type StoreOutcome<Data> = Outcome<Data>

export interface AgentCommands {
  readonly inspectHome: (signal?: AbortSignal) => StoreOutcome<HomeInspection>
  readonly inspectOutage: (signal?: AbortSignal) => StoreOutcome<OutageInspection>
  readonly simulatePlan: (
    planId: string | SimulatePlanInput,
    signal?: AbortSignal,
  ) => Promise<StoreOutcome<SimulationResult>>
  readonly comparePlans: (
    planIds: readonly string[] | ComparePlansInput,
    signal?: AbortSignal,
  ) => Promise<StoreOutcome<PlanComparison>>
  readonly explainInterval: (
    simulationId: string | ExplainIntervalInput,
    intervalIndex?: number,
    signal?: AbortSignal,
  ) => Promise<StoreOutcome<IntervalExplanation>>
  readonly stagePlan: (
    input: string | StagePlanInput,
    replaceProposalIdOrSignal?: string | AbortSignal,
    signal?: AbortSignal,
  ) => StoreOutcome<Proposal>
  readonly requestReview: (
    proposalId: string | ProposalCommandInput,
    signal?: AbortSignal,
  ) => StoreOutcome<ReviewResult>
  readonly discardPlan: (
    proposalId: string | ProposalCommandInput,
    signal?: AbortSignal,
  ) => StoreOutcome<DiscardResult>
  readonly simulate: AgentCommands['simulatePlan']
  readonly compare: AgentCommands['comparePlans']
  readonly explain: AgentCommands['explainInterval']
  readonly stage: AgentCommands['stagePlan']
  readonly review: AgentCommands['requestReview']
  readonly discard: AgentCommands['discardPlan']
}

export interface HumanCommands {
  readonly createCommitCapability: (
    proposalId: string | ProposalCommandInput,
  ) => StoreOutcome<CommitCapability>
  readonly prepareCommit: HumanCommands['createCommitCapability']
  readonly commit: (
    capability: CommitCapability,
    signal?: AbortSignal,
  ) => StoreOutcome<CommitResult>
  readonly refreshForecast: (
    signal?: AbortSignal,
  ) => StoreOutcome<ForecastRefreshResult>
  readonly refresh: HumanCommands['refreshForecast']
  readonly undo: (signal?: AbortSignal) => StoreOutcome<UndoResult>
  readonly undoLatest: HumanCommands['undo']
  readonly reset: (signal?: AbortSignal) => StoreOutcome<ResetResult>
}

export interface WattKeepStore {
  readonly getSnapshot: () => StoreSnapshot
  readonly subscribe: (listener: (snapshot?: StoreSnapshot) => void) => () => void
  readonly agent: AgentCommands
  readonly human: HumanCommands
}

export interface StoreOptions {
  readonly storage?: StorageLike | null
  readonly storageKey?: string
}

export const MAX_CACHED_SIMULATIONS = 24
export const MAX_CACHED_COMPARISONS = 8
export const MAX_CACHED_EXPLANATIONS = 24

const CANCELLED_MESSAGE = 'The operation was cancelled before a state transition began.'

const nextActions = Object.freeze({
  retry: Object.freeze(['Retry the operation.']),
  inspect: Object.freeze(['Inspect the current household state.']),
  simulate: Object.freeze(['Run a fresh simulation for the current forecast.']),
  stage: Object.freeze(['Stage a fresh feasible simulation.']),
  review: Object.freeze(['Request review before committing the proposal.']),
  discard: Object.freeze(['Discard the current proposal or inspect its ID.']),
  restage: Object.freeze(['Run a fresh simulation, then restage the proposal.']),
  undo: Object.freeze(['Undo the latest eligible committed change.']),
})

const cancelled = <Data,>(): StoreOutcome<Data> => failure(
  ERROR_CODES.CANCELLED,
  CANCELLED_MESSAGE,
  nextActions.retry,
)

const sessionMismatch = <Data,>(): StoreOutcome<Data> => failure(
  ERROR_CODES.SESSION_MISMATCH,
  'The operation belongs to an earlier WattKeep session and was not applied.',
  nextActions.retry,
)

const freezeDeep = <T,>(
  value: T,
  seen: WeakSet<object> = new WeakSet<object>(),
): T => {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return value
  }

  seen.add(value)
  for (const nested of Object.values(value)) {
    freezeDeep(nested, seen)
  }

  return Object.freeze(value)
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
)

const isBatteryValue = (value: unknown): value is Battery => (
  isRecord(value)
  && isFiniteNumber(value.capacityKWh)
  && isFiniteNumber(value.startEnergyKWh)
  && isFiniteNumber(value.startChargePercent)
  && isFiniteNumber(value.reserveKWh)
  && isFiniteNumber(value.reservePercent)
)

const isOutageValue = (value: unknown): value is Outage => (
  isRecord(value)
  && typeof value.start === 'string'
  && typeof value.end === 'string'
  && isFiniteNumber(value.intervalHours)
  && typeof value.intervalCount === 'number'
  && Number.isInteger(value.intervalCount)
  && value.intervalCount >= 0
)

const isAbortSignal = (value: unknown): value is AbortSignal => (
  isRecord(value) && typeof value.aborted === 'boolean'
)

const asProposalId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value
  }
  if (isRecord(value) && typeof value.proposalId === 'string') {
    return value.proposalId
  }
  return null
}

const asInvocationEpoch = (value: unknown): number | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  if (typeof value.sessionEpoch === 'number') {
    return value.sessionEpoch
  }
  if (typeof value.epoch === 'number') {
    return value.epoch
  }
  return undefined
}

const getPlan = (
  scenario: ReadonlyScenario,
  planId: string,
): PlanPreset | undefined => scenario.plans.find((plan) => plan.id === planId)

const buildPolicy = (
  scenario: ReadonlyScenario,
  planId: string,
): LoadPolicy | undefined => {
  const plan = getPlan(scenario, planId)
  if (plan === undefined) {
    return undefined
  }

  return freezeDeep({
    planId: plan.id,
    planName: plan.name,
    description: plan.description,
    loadIds: Object.freeze([...plan.loadIds]),
  })
}

const buildInitialPolicy = (scenario: ReadonlyScenario): LoadPolicy => {
  const policy = buildPolicy(scenario, 'essential-reserve')
  if (policy === undefined) {
    throw new Error('The seeded scenario is missing Essential Reserve.')
  }
  return policy
}

const buildDiff = (
  before: LoadPolicy,
  after: LoadPolicy,
): LoadPolicyDiff => {
  const beforeIds = new Set(before.loadIds)
  const afterIds = new Set(after.loadIds)
  return freezeDeep({
    before,
    after,
    addedLoadIds: Object.freeze(after.loadIds.filter((loadId) => !beforeIds.has(loadId))),
    removedLoadIds: Object.freeze(before.loadIds.filter((loadId) => !afterIds.has(loadId))),
    unchangedLoadIds: Object.freeze(before.loadIds.filter((loadId) => afterIds.has(loadId))),
    changed: before.planId !== after.planId
      || before.loadIds.length !== after.loadIds.length
      || before.loadIds.some((loadId, index) => after.loadIds[index] !== loadId),
  })
}

const proposalSummary = (
  proposal: Proposal | null,
): ProposalSummary | null => proposal === null ? null : freezeDeep({
  proposalId: proposal.proposalId,
  status: proposal.status,
  baseRevision: proposal.baseRevision,
  currentRevision: proposal.currentRevision,
  planId: proposal.planId,
})

const buildSnapshot = (seed: {
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly forecastKind: ForecastKind
  readonly scenario: ReadonlyScenario
  readonly committedPolicy: LoadPolicy
  readonly activeProposal: Proposal | null
  readonly simulations: readonly CachedSimulation[]
  readonly comparisons: readonly CachedComparison[]
  readonly explanations: readonly CachedExplanation[]
  readonly journal: readonly JournalEntry[]
  readonly archivedSessions: readonly ArchivedSession[]
  readonly persistenceMode: PersistenceMode
  readonly persistenceIssue: PersistenceIssue | null
  readonly lastCommit: CommitRecord | null
}): StoreSnapshot => {
  const simulations = Object.freeze([...seed.simulations])
  const comparisons = Object.freeze([...seed.comparisons])
  const explanations = Object.freeze([...seed.explanations])

  return freezeDeep({
    schemaVersion: 1 as const,
    sessionEpoch: seed.sessionEpoch,
    workspaceRevision: seed.workspaceRevision,
    revision: seed.workspaceRevision,
    forecastKind: seed.forecastKind,
    scenario: seed.scenario,
    currentScenario: seed.scenario,
    forecast: seed.scenario,
    currentForecast: seed.scenario,
    committedPolicy: seed.committedPolicy,
    activeProposal: seed.activeProposal,
    simulations,
    simulationCache: simulations,
    comparisons,
    comparisonCache: comparisons,
    explanations,
    explanationCache: explanations,
    journal: Object.freeze([...seed.journal]),
    archivedSessions: Object.freeze([...seed.archivedSessions]),
    persistenceMode: seed.persistenceMode,
    persistenceIssue: seed.persistenceIssue,
    lastCommit: seed.lastCommit,
    undoAvailable: seed.lastCommit !== null,
  })
}

const toPersistedState = (snapshot: StoreSnapshot): PersistedStoreState => ({
  sessionEpoch: snapshot.sessionEpoch,
  workspaceRevision: snapshot.workspaceRevision,
  forecastKind: snapshot.forecastKind,
  committedPolicy: snapshot.committedPolicy,
  activeProposal: snapshot.activeProposal,
  journal: snapshot.journal,
  archivedSessions: snapshot.archivedSessions,
  lastCommit: snapshot.lastCommit,
})

const hash = (value: string): string => {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}

const makeComparisonId = (
  scenario: ReadonlyScenario,
  planIds: readonly string[],
): string => `comparison:${scenario.id}:${scenario.revision}:${hash(JSON.stringify(planIds))}`

const makeProposalId = (
  epoch: number,
  revision: number,
  simulation: SimulationResult,
): string => `proposal:${epoch}:${revision}:${simulation.planId}:${simulation.fingerprint}`

const makeJournalEntry = (
  snapshot: StoreSnapshot,
  event: JournalEvent,
  details: Omit<JournalEntry, 'id' | 'sequence' | 'event' | 'type' | 'sessionEpoch' | 'workspaceRevision'> = {},
  workspaceRevision: number = snapshot.workspaceRevision,
): JournalEntry => {
  const sequence = snapshot.journal.length + 1
  const definedDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as Omit<JournalEntry, 'id' | 'sequence' | 'event' | 'type' | 'sessionEpoch' | 'workspaceRevision'>
  return freezeDeep({
    id: `journal:${snapshot.sessionEpoch}:${sequence}`,
    sequence,
    event,
    type: event,
    sessionEpoch: snapshot.sessionEpoch,
    workspaceRevision,
    ...definedDetails,
  })
}

const appendJournal = (
  snapshot: StoreSnapshot,
  event: JournalEvent,
  details: Omit<JournalEntry, 'id' | 'sequence' | 'event' | 'type' | 'sessionEpoch' | 'workspaceRevision'> = {},
  workspaceRevision: number = snapshot.workspaceRevision,
): readonly JournalEntry[] => Object.freeze([
  ...snapshot.journal,
  makeJournalEntry(snapshot, event, details, workspaceRevision),
])

const normalisePolicy = (
  value: unknown,
  scenario: ReadonlyScenario,
): LoadPolicy | null => {
  if (!isRecord(value) || typeof value.planId !== 'string') {
    return null
  }

  return buildPolicy(scenario, value.planId) ?? null
}

const isValidProposalStatus = (value: unknown): value is ProposalStatus => (
  value === 'staged' || value === 'review-requested' || value === 'stale'
)

const JOURNAL_EVENTS: ReadonlySet<JournalEvent> = new Set([
  'session-reset',
  'proposal-staged',
  'review-requested',
  'forecast-refreshed',
  'stale-rejection',
  'proposal-discarded',
  'commit',
  'undo',
])

const isValidJournal = (
  value: readonly unknown[],
  sessionEpoch: number,
): value is readonly JournalEntry[] => value.every((entry, index) => (
  isRecord(entry)
  && typeof entry.id === 'string'
  && entry.sequence === index + 1
  && typeof entry.event === 'string'
  && JOURNAL_EVENTS.has(entry.event as JournalEvent)
  && entry.type === entry.event
  && entry.sessionEpoch === sessionEpoch
  && typeof entry.workspaceRevision === 'number'
  && Number.isInteger(entry.workspaceRevision)
  && entry.workspaceRevision >= 1
))

const isValidArchivedSessions = (
  value: readonly unknown[],
): value is readonly ArchivedSession[] => value.every((session) => (
  isRecord(session)
  && typeof session.sessionEpoch === 'number'
  && Number.isInteger(session.sessionEpoch)
  && session.sessionEpoch >= 1
  && typeof session.workspaceRevision === 'number'
  && Number.isInteger(session.workspaceRevision)
  && session.workspaceRevision >= 1
  && (session.forecastKind === 'canonical' || session.forecastKind === 'alternate')
  && Array.isArray(session.journal)
  && isValidJournal(session.journal, session.sessionEpoch)
  && isRecord(session.committedPolicy)
  && isRecord(session.snapshot)
  && session.snapshot.sessionEpoch === session.sessionEpoch
  && session.snapshot.workspaceRevision === session.workspaceRevision
))

const normaliseProposal = (
  value: unknown,
  scenario: ReadonlyScenario,
): Proposal | null => {
  if (!isRecord(value)
    || typeof value.proposalId !== 'string'
    || typeof value.status !== 'string'
    || !isValidProposalStatus(value.status)
    || typeof value.baseRevision !== 'number'
    || !Number.isInteger(value.baseRevision)
    || value.baseRevision < 1
    || !isRecord(value.simulation)
    || typeof value.simulation.simulationId !== 'string'
    || typeof value.simulation.fingerprint !== 'string'
    || typeof value.simulation.planId !== 'string'
    || typeof value.simulation.scenarioId !== 'string'
    || typeof value.simulation.planName !== 'string'
    || !Array.isArray(value.simulation.intervals)
    || !isRecord(value.assumptions)
    || !isBatteryValue(value.assumptions.battery)
    || !isOutageValue(value.assumptions.outage)
    || !Array.isArray(value.assumptions.solarKWh)) {
    return null
  }

  const baseRevision = value.baseRevision
  const result = value.simulation as unknown as SimulationResult
  if (getPlan(scenario, result.planId) === undefined) {
    return null
  }
  const beforePolicy = normalisePolicy(value.beforePolicy ?? value.before, scenario)
  const afterPolicy = normalisePolicy(value.afterPolicy ?? value.after, scenario)
  if (beforePolicy === null || afterPolicy === null) {
    return null
  }

  const assumptionsRecord = value.assumptions
  const battery = assumptionsRecord.battery
  const outage = assumptionsRecord.outage
  if (!isBatteryValue(battery) || !isOutageValue(outage)) {
    return null
  }
  const forecastKindValue = assumptionsRecord.forecastKind
  const forecastKind: ForecastKind = forecastKindValue === 'alternate'
    ? 'alternate'
    : 'canonical'
  if (forecastKindValue !== 'canonical' && forecastKindValue !== 'alternate') {
    return null
  }
  const solarValues = assumptionsRecord.solarKWh as unknown as readonly unknown[]
  if (!solarValues.every((solar) => isFiniteNumber(solar))) {
    return null
  }

  const assumptions = freezeDeep({
    scenarioId: typeof assumptionsRecord.scenarioId === 'string'
      ? assumptionsRecord.scenarioId
      : result.scenarioId,
    scenarioRevision: typeof assumptionsRecord.scenarioRevision === 'number'
      ? assumptionsRecord.scenarioRevision
      : scenario.revision,
    workspaceRevision: typeof assumptionsRecord.workspaceRevision === 'number'
      ? assumptionsRecord.workspaceRevision
      : baseRevision,
    forecastKind,
    battery,
    outage,
    solarKWh: Object.freeze(solarValues.map((solar) => (
      typeof solar === 'number' ? solar : Number.NaN
    ))),
    reserveKWh: typeof assumptionsRecord.reserveKWh === 'number'
      ? assumptionsRecord.reserveKWh
      : result.reserveKWh,
  })

  const diff = buildDiff(beforePolicy, afterPolicy)
  const proposalId = value.proposalId
  return freezeDeep({
    proposalId,
    id: proposalId,
    status: value.status,
    baseRevision,
    currentRevision: typeof value.currentRevision === 'number'
      ? value.currentRevision
      : baseRevision,
    simulationId: result.simulationId,
    simulationFingerprint: result.fingerprint,
    fingerprint: result.fingerprint,
    scenarioId: result.scenarioId,
    planId: result.planId,
    planName: result.planName,
    assumptions,
    simulation: result,
    result,
    beforePolicy,
    afterPolicy,
    before: beforePolicy,
    after: afterPolicy,
    diff,
  })
}

const normaliseCommit = (
  value: unknown,
  scenario: ReadonlyScenario,
): CommitRecord | null => {
  if (!isRecord(value)
    || typeof value.commitId !== 'string'
    || typeof value.proposalId !== 'string'
    || typeof value.revision !== 'number'
    || typeof value.journalSequence !== 'number'
    || !Number.isInteger(value.revision)
    || value.revision < 1
    || !Number.isInteger(value.journalSequence)
    || value.journalSequence < 1) {
    return null
  }

  const revision = value.revision
  const journalSequence = value.journalSequence
  const beforePolicy = normalisePolicy(value.beforePolicy, scenario)
  const afterPolicy = normalisePolicy(value.afterPolicy, scenario)
  if (beforePolicy === null || afterPolicy === null) {
    return null
  }

  return freezeDeep({
    commitId: value.commitId,
    proposalId: value.proposalId,
    revision,
    journalSequence,
    beforePolicy,
    afterPolicy,
  })
}

const hydratePersisted = (
  persisted: PersistedStoreState,
  scenario: ReadonlyScenario,
): {
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly forecastKind: ForecastKind
  readonly committedPolicy: LoadPolicy
  readonly activeProposal: Proposal | null
  readonly journal: readonly JournalEntry[]
  readonly archivedSessions: readonly ArchivedSession[]
  readonly lastCommit: CommitRecord | null
} | null => {
  if (!isRecord(persisted)
    || !Number.isInteger(persisted.sessionEpoch)
    || persisted.sessionEpoch < 1
    || !Number.isInteger(persisted.workspaceRevision)
    || persisted.workspaceRevision < 1
    || (persisted.forecastKind !== 'canonical' && persisted.forecastKind !== 'alternate')
    || !Array.isArray(persisted.journal)
    || !Array.isArray(persisted.archivedSessions)) {
    return null
  }

  const committedPolicy = normalisePolicy(persisted.committedPolicy, scenario)
  if (committedPolicy === null) {
    return null
  }

  const activeProposal = persisted.activeProposal === null
    ? null
    : normaliseProposal(persisted.activeProposal, scenario)
  if (persisted.activeProposal !== null && activeProposal === null) {
    return null
  }
  if (activeProposal !== null) {
    const expectedProposalId = makeProposalId(
      persisted.sessionEpoch,
      activeProposal.baseRevision,
      activeProposal.simulation,
    )
    const revisionStateIsValid = activeProposal.status === 'stale'
      ? activeProposal.baseRevision < persisted.workspaceRevision
      : activeProposal.baseRevision === persisted.workspaceRevision
    if (activeProposal.proposalId !== expectedProposalId
      || activeProposal.planId !== activeProposal.afterPolicy.planId
      || activeProposal.simulation.planId !== activeProposal.afterPolicy.planId
      || activeProposal.simulationId !== activeProposal.simulation.simulationId
      || activeProposal.simulationFingerprint !== activeProposal.simulation.fingerprint
      || !activeProposal.simulation.feasible
      || !revisionStateIsValid) {
      return null
    }
  }

  const lastCommit = persisted.lastCommit === null
    ? null
    : normaliseCommit(persisted.lastCommit, scenario)
  if (persisted.lastCommit !== null && lastCommit === null) {
    return null
  }
  if (lastCommit !== null
    && (lastCommit.afterPolicy.planId !== committedPolicy.planId
      || lastCommit.revision > persisted.workspaceRevision)) {
    return null
  }
  if (!isValidJournal(persisted.journal, persisted.sessionEpoch)
    || !isValidArchivedSessions(persisted.archivedSessions)) {
    return null
  }

  return {
    sessionEpoch: persisted.sessionEpoch,
    workspaceRevision: persisted.workspaceRevision,
    forecastKind: persisted.forecastKind,
    committedPolicy,
    activeProposal,
    journal: freezeDeep([...persisted.journal] as JournalEntry[]),
    archivedSessions: freezeDeep([...persisted.archivedSessions] as ArchivedSession[]),
    lastCommit,
  }
}

export const createStore = (options: StoreOptions = {}): WattKeepStore => {
  const storageKey = options.storageKey ?? PERSISTENCE_KEY
  const read = readPersistedState(options.storage, storageKey)
  const storage = resolveStorage(options.storage)
  const canonicalScenario = getScenario()
  const alternateScenario = getAlternateScenario()

  const hydrated = read.state === null
    ? null
    : hydratePersisted(
      read.state,
      read.state.forecastKind === 'alternate' ? alternateScenario : canonicalScenario,
    )
  const hydratedSuccessfully = read.state === null || hydrated !== null
  const initialMode: PersistenceMode = !hydratedSuccessfully || read.issue !== null
    ? 'memory-only'
    : 'persistent'
  const initialIssue: PersistenceIssue | null = !hydratedSuccessfully
    ? 'corrupt'
    : read.issue

  const initialScenario = hydrated?.forecastKind === 'alternate'
    ? alternateScenario
    : canonicalScenario
  const initialPolicy = hydrated?.committedPolicy ?? buildInitialPolicy(initialScenario)

  let current = buildSnapshot({
    sessionEpoch: hydrated?.sessionEpoch ?? 1,
    workspaceRevision: hydrated?.workspaceRevision ?? 1,
    forecastKind: hydrated?.forecastKind ?? 'canonical',
    scenario: initialScenario,
    committedPolicy: initialPolicy,
    activeProposal: hydrated?.activeProposal ?? null,
    simulations: [],
    comparisons: [],
    explanations: [],
    journal: hydrated?.journal ?? [],
    archivedSessions: hydrated?.archivedSessions ?? [],
    persistenceMode: initialMode,
    persistenceIssue: initialIssue,
    lastCommit: hydrated?.lastCommit ?? null,
  })

  const listeners = new Set<(snapshot?: StoreSnapshot) => void>()
  const discardedProposalIds = new Set<string>(current.journal
    .filter((entry) => entry.event === 'proposal-discarded' && typeof entry.proposalId === 'string')
    .map((entry) => entry.proposalId as string))

  type CapabilityState = 'active' | 'consumed' | 'invalidated'
  type InvalidationReason = 'competing-commit' | 'revision-conflict' | 'other-mutation'
  interface CapabilityRecord {
    readonly epoch: number
    readonly proposalId: string
    readonly baseRevision: number
    state: CapabilityState
    invalidationReason?: InvalidationReason
  }

  const capabilityRecords = new WeakMap<object, CapabilityRecord>()
  const activeCapabilities = new Set<object>()
  const capabilityBrand = Symbol('wattkeep-commit-capability')

  const invalidateCapabilities = (reason: InvalidationReason): void => {
    for (const capability of activeCapabilities) {
      const record = capabilityRecords.get(capability)
      if (record !== undefined) {
        record.state = 'invalidated'
        record.invalidationReason = reason
      }
    }
    activeCapabilities.clear()
  }

  const publish = (
    next: StoreSnapshot,
    persist: boolean,
  ): void => {
    // The in-memory assignment is the linearisation point. Persistence is a
    // durability side effect and must never be able to roll a safe transition
    // back when an adapter throws.
    current = next
    let published = next
    if (persist && next.persistenceMode === 'persistent') {
      const result = writePersistedState(storage, toPersistedState(next), storageKey)
      if (!result.ok) {
        published = buildSnapshot({
          ...next,
          persistenceMode: 'memory-only',
          persistenceIssue: result.issue ?? 'write-failed',
        })
      }
    }

    current = published
    for (const listener of listeners) {
      listener(current)
    }
  }

  const nextSnapshot = (
    changes: Partial<{
      readonly sessionEpoch: number
      readonly workspaceRevision: number
      readonly forecastKind: ForecastKind
      readonly scenario: ReadonlyScenario
      readonly committedPolicy: LoadPolicy
      readonly activeProposal: Proposal | null
      readonly simulations: readonly CachedSimulation[]
      readonly comparisons: readonly CachedComparison[]
      readonly explanations: readonly CachedExplanation[]
      readonly journal: readonly JournalEntry[]
      readonly archivedSessions: readonly ArchivedSession[]
      readonly persistenceMode: PersistenceMode
      readonly persistenceIssue: PersistenceIssue | null
      readonly lastCommit: CommitRecord | null
    }>,
  ): StoreSnapshot => buildSnapshot({
    sessionEpoch: current.sessionEpoch,
    workspaceRevision: current.workspaceRevision,
    forecastKind: current.forecastKind,
    scenario: current.scenario,
    committedPolicy: current.committedPolicy,
    activeProposal: current.activeProposal,
    simulations: current.simulations,
    comparisons: current.comparisons,
    explanations: current.explanations,
    journal: current.journal,
    archivedSessions: current.archivedSessions,
    persistenceMode: current.persistenceMode,
    persistenceIssue: current.persistenceIssue,
    lastCommit: current.lastCommit,
    ...changes,
  })

  const cacheSimulations = (
    simulations: readonly CachedSimulation[],
    entry: CachedSimulation,
  ): readonly CachedSimulation[] => Object.freeze([
    ...simulations.filter((candidate) => candidate.simulationId !== entry.simulationId),
    entry,
  ].slice(-MAX_CACHED_SIMULATIONS))

  const cacheComparisons = (
    comparisons: readonly CachedComparison[],
    entry: CachedComparison,
  ): readonly CachedComparison[] => Object.freeze([
    ...comparisons.filter((candidate) => candidate.comparisonId !== entry.comparisonId),
    entry,
  ].slice(-MAX_CACHED_COMPARISONS))

  const cacheExplanations = (
    explanations: readonly CachedExplanation[],
    entry: CachedExplanation,
  ): readonly CachedExplanation[] => Object.freeze([
    ...explanations.filter((candidate) => candidate.explanationId !== entry.explanationId),
    entry,
  ].slice(-MAX_CACHED_EXPLANATIONS))

  const inspectHome = (signal?: AbortSignal): StoreOutcome<HomeInspection> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const committedIds = new Set(current.committedPolicy.loadIds)
    return success(freezeDeep({
      household: current.scenario.household,
      battery: current.scenario.battery,
      reserveKWh: current.scenario.battery.reserveKWh,
      loads: Object.freeze(current.scenario.loads.map((load) => freezeDeep({
        ...load,
        committed: committedIds.has(load.id),
      }))),
      plans: current.scenario.plans,
      committedPolicy: current.committedPolicy,
      workspaceRevision: current.workspaceRevision,
      sessionEpoch: current.sessionEpoch,
      forecastKind: current.forecastKind,
      proposal: proposalSummary(current.activeProposal),
    }))
  }

  const inspectOutage = (signal?: AbortSignal): StoreOutcome<OutageInspection> => {
    if (signal?.aborted) {
      return cancelled()
    }

    return success(freezeDeep({
      outage: current.scenario.outage,
      intervals: current.scenario.intervals,
      solarKWh: Object.freeze([...current.scenario.solarKWh]),
      scenarioId: current.scenario.id,
      scenarioRevision: current.scenario.revision,
      workspaceRevision: current.workspaceRevision,
      sessionEpoch: current.sessionEpoch,
      forecastKind: current.forecastKind,
    }))
  }

  const simulatePlan = async (
    planInput: unknown,
    signal?: AbortSignal,
  ): Promise<StoreOutcome<SimulationResult>> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const requestedEpoch = asInvocationEpoch(planInput)
    if (requestedEpoch !== undefined && requestedEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const invocationEpoch = current.sessionEpoch
    const invocationRevision = current.workspaceRevision
    const invocationScenario = current.scenario
    const planId = typeof planInput === 'string'
      ? planInput
      : isRecord(planInput) && typeof planInput.planId === 'string'
        ? planInput.planId
        : ''
    const outcome = await calculateSimulation(invocationScenario, planId, signal)
    if (!outcome.ok) {
      return outcome
    }
    if (signal?.aborted) {
      return cancelled()
    }
    if (current.sessionEpoch !== invocationEpoch) {
      return sessionMismatch()
    }
    if (current.workspaceRevision !== invocationRevision
      || current.scenario !== invocationScenario) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'The simulation was calculated for an earlier workspace revision.',
        nextActions.simulate,
      )
    }

    const result = outcome.data
    const cached = freezeDeep({
      simulationId: result.simulationId,
      sessionEpoch: invocationEpoch,
      workspaceRevision: invocationRevision,
      result,
      simulation: result,
    })
    const alreadyCached = current.simulations.some((entry) => (
      entry.simulationId === cached.simulationId
      && entry.workspaceRevision === cached.workspaceRevision
    ))
    if (!alreadyCached) {
      publish(nextSnapshot({
        simulations: cacheSimulations(current.simulations, cached),
      }), false)
    }

    return success(result)
  }

  const comparePlans = async (
    planInput: unknown,
    signal?: AbortSignal,
  ): Promise<StoreOutcome<PlanComparison>> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const requestedEpoch = asInvocationEpoch(planInput)
    if (requestedEpoch !== undefined && requestedEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const invocationEpoch = current.sessionEpoch
    const invocationRevision = current.workspaceRevision
    const invocationScenario = current.scenario
    const rawPlanIds = Array.isArray(planInput)
      ? planInput as readonly string[]
      : isRecord(planInput) && Array.isArray(planInput.planIds)
        ? planInput.planIds as readonly string[]
        : []
    const planIds = rawPlanIds.map((planId) => (
      typeof planId === 'string' ? planId : ''
    ))
    const outcome = await calculateComparison(invocationScenario, planIds, signal)
    if (!outcome.ok) {
      return outcome
    }
    if (signal?.aborted) {
      return cancelled()
    }
    if (current.sessionEpoch !== invocationEpoch) {
      return sessionMismatch()
    }
    if (current.workspaceRevision !== invocationRevision
      || current.scenario !== invocationScenario) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'The comparison was calculated for an earlier workspace revision.',
        nextActions.simulate,
      )
    }

    const comparison = outcome.data
    const cachedSimulations = comparison.ranked.reduce(
      (entries, ranked) => cacheSimulations(entries, freezeDeep({
        simulationId: ranked.simulation.simulationId,
        sessionEpoch: invocationEpoch,
        workspaceRevision: invocationRevision,
        result: ranked.simulation,
        simulation: ranked.simulation,
      })),
      current.simulations,
    )
    const comparisonEntry = freezeDeep({
      comparisonId: makeComparisonId(invocationScenario, planIds),
      sessionEpoch: invocationEpoch,
      workspaceRevision: invocationRevision,
      comparison,
    })
    const existing = current.comparisons.find((entry) => (
      entry.comparisonId === comparisonEntry.comparisonId
      && entry.workspaceRevision === invocationRevision
    ))
    if (existing === undefined || cachedSimulations !== current.simulations) {
      publish(nextSnapshot({
        simulations: cachedSimulations,
        comparisons: cacheComparisons(current.comparisons, comparisonEntry),
      }), false)
    }

    return success(comparison)
  }

  const explainInterval = async (
    simulationInput: unknown,
    intervalInput?: number,
    signal?: AbortSignal,
  ): Promise<StoreOutcome<IntervalExplanation>> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const requestedEpoch = asInvocationEpoch(simulationInput)
    if (requestedEpoch !== undefined && requestedEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const simulationId = typeof simulationInput === 'string'
      ? simulationInput
      : isRecord(simulationInput) && typeof simulationInput.simulationId === 'string'
        ? simulationInput.simulationId
        : ''
    const intervalIndex = typeof simulationInput === 'string'
      ? intervalInput
      : isRecord(simulationInput) && typeof simulationInput.intervalIndex === 'number'
        ? simulationInput.intervalIndex
        : Number.NaN
    const requestedIntervalIndex = intervalIndex ?? Number.NaN
    const cached = current.simulations.find((entry) => entry.simulationId === simulationId)
    if (cached === undefined) {
      return failure(
        ERROR_CODES.UNKNOWN_SIMULATION,
        'Run a simulation for this plan before explaining an interval.',
        nextActions.simulate,
      )
    }
    if (cached.sessionEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }
    if (cached.workspaceRevision !== current.workspaceRevision) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'The simulation belongs to an earlier workspace revision.',
        nextActions.simulate,
      )
    }

    const invocationEpoch = current.sessionEpoch
    const invocationRevision = current.workspaceRevision
    const outcome = await calculateExplanation(cached.result, requestedIntervalIndex, signal)
    if (!outcome.ok) {
      return outcome
    }
    if (signal?.aborted) {
      return cancelled()
    }
    if (current.sessionEpoch !== invocationEpoch) {
      return sessionMismatch()
    }
    if (current.workspaceRevision !== invocationRevision) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'The explanation belongs to an earlier workspace revision.',
        nextActions.simulate,
      )
    }

    const explanation = outcome.data
    const explanationEntry = freezeDeep({
      explanationId: `${simulationId}:${requestedIntervalIndex}`,
      simulationId,
      intervalIndex: requestedIntervalIndex,
      sessionEpoch: invocationEpoch,
      workspaceRevision: invocationRevision,
      explanation,
    })
    if (!current.explanations.some((entry) => (
      entry.explanationId === explanationEntry.explanationId
      && entry.workspaceRevision === invocationRevision
    ))) {
      publish(nextSnapshot({
        explanations: cacheExplanations(current.explanations, explanationEntry),
      }), false)
    }

    return success(explanation)
  }

  const parseStageInput = (
    input: unknown,
    replaceProposalIdOrSignal?: string | AbortSignal,
    signal?: AbortSignal,
  ): {
    readonly simulationId: string
    readonly replaceProposalId?: string
    readonly simulationFingerprint?: string
    readonly planId?: string
    readonly scenarioId?: string
    readonly workspaceRevision?: number
    readonly sessionEpoch?: number
    readonly signal?: AbortSignal
  } => {
    if (typeof input === 'string') {
      return {
        simulationId: input,
        replaceProposalId: typeof replaceProposalIdOrSignal === 'string'
          ? replaceProposalIdOrSignal
          : undefined,
        simulationFingerprint: undefined,
        planId: undefined,
        scenarioId: undefined,
        workspaceRevision: undefined,
        sessionEpoch: undefined,
        signal: isAbortSignal(replaceProposalIdOrSignal)
          ? replaceProposalIdOrSignal
          : signal,
      }
    }

    if (!isRecord(input)) {
      return {
        simulationId: '',
        simulationFingerprint: undefined,
        planId: undefined,
        scenarioId: undefined,
        workspaceRevision: undefined,
        sessionEpoch: undefined,
        signal: isAbortSignal(replaceProposalIdOrSignal)
          ? replaceProposalIdOrSignal
          : signal,
      }
    }

    return {
      simulationId: typeof input.simulationId === 'string' ? input.simulationId : '',
      replaceProposalId: typeof input.replaceProposalId === 'string'
        ? input.replaceProposalId
        : undefined,
      simulationFingerprint: typeof input.simulationFingerprint === 'string'
        ? input.simulationFingerprint
        : typeof input.fingerprint === 'string'
          ? input.fingerprint
          : isRecord(input.result) && typeof input.result.fingerprint === 'string'
            ? input.result.fingerprint
            : isRecord(input.simulation) && typeof input.simulation.fingerprint === 'string'
              ? input.simulation.fingerprint
              : undefined,
      planId: typeof input.planId === 'string'
        ? input.planId
        : isRecord(input.result) && typeof input.result.planId === 'string'
          ? input.result.planId
          : isRecord(input.simulation) && typeof input.simulation.planId === 'string'
            ? input.simulation.planId
            : undefined,
      scenarioId: typeof input.scenarioId === 'string'
        ? input.scenarioId
        : isRecord(input.result) && typeof input.result.scenarioId === 'string'
          ? input.result.scenarioId
          : isRecord(input.simulation) && typeof input.simulation.scenarioId === 'string'
            ? input.simulation.scenarioId
            : undefined,
      workspaceRevision: typeof input.workspaceRevision === 'number'
        ? input.workspaceRevision
        : undefined,
      sessionEpoch: asInvocationEpoch(input),
      signal: replaceProposalIdOrSignal !== undefined && isAbortSignal(replaceProposalIdOrSignal)
        ? replaceProposalIdOrSignal
        : signal,
    }
  }

  const stagePlan = (
    input: unknown,
    replaceProposalIdOrSignal?: string | AbortSignal,
    signal?: AbortSignal,
  ): StoreOutcome<Proposal> => {
    const parsed = parseStageInput(input, replaceProposalIdOrSignal, signal)
    if (parsed.signal?.aborted) {
      return cancelled()
    }
    if (parsed.sessionEpoch !== undefined && parsed.sessionEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const cached = current.simulations.find((entry) => entry.simulationId === parsed.simulationId)
    if (cached === undefined) {
      return failure(
        ERROR_CODES.UNKNOWN_SIMULATION,
        'Run the requested plan simulation before staging it.',
        nextActions.simulate,
      )
    }
    if (parsed.simulationFingerprint !== undefined
      && parsed.simulationFingerprint !== cached.result.fingerprint) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The supplied simulation fingerprint does not match the cached result.',
        nextActions.simulate,
      )
    }
    if (parsed.planId !== undefined && parsed.planId !== cached.result.planId) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The supplied plan does not match the cached simulation.',
        nextActions.simulate,
      )
    }
    if (parsed.scenarioId !== undefined && parsed.scenarioId !== cached.result.scenarioId) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'The simulation belongs to a different scenario.',
        nextActions.simulate,
      )
    }
    if (parsed.workspaceRevision !== undefined
      && parsed.workspaceRevision !== current.workspaceRevision) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'The supplied simulation belongs to an earlier workspace revision.',
        nextActions.restage,
      )
    }
    if (cached.sessionEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }
    if (cached.workspaceRevision !== current.workspaceRevision
      || cached.result.scenarioId !== current.scenario.id
      || cached.result.simulationId !== parsed.simulationId) {
      return failure(
        ERROR_CODES.STALE_SIMULATION,
        'Run a fresh simulation for the current forecast before staging it.',
        nextActions.restage,
      )
    }
    const active = current.activeProposal
    if (active !== null) {
      if (parsed.replaceProposalId !== undefined && parsed.replaceProposalId !== active.proposalId) {
        return failure(
          ERROR_CODES.PROPOSAL_MISMATCH,
          'The replacement ID does not match the active proposal.',
          nextActions.discard,
        )
      }

      const isSame = active.simulationId === cached.result.simulationId
        && active.simulationFingerprint === cached.result.fingerprint
        && active.baseRevision === current.workspaceRevision
      if (isSame && parsed.replaceProposalId === undefined) {
        return success(active)
      }

      if (active.status !== 'stale' || parsed.replaceProposalId !== active.proposalId) {
        return failure(
          ERROR_CODES.ACTIVE_PROPOSAL,
          'A different proposal is already active. Discard it before staging another plan.',
          nextActions.discard,
        )
      }
    } else if (parsed.replaceProposalId !== undefined) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'There is no active proposal with the supplied replacement ID.',
        nextActions.stage,
      )
    }

    if (!cached.result.feasible) {
      return failure(
        ERROR_CODES.INFEASIBLE_PLAN,
        'This plan breaches the battery reserve and cannot be staged.',
        nextActions.simulate,
      )
    }

    const afterPolicy = buildPolicy(current.scenario, cached.result.planId)
    if (afterPolicy === undefined) {
      return failure(
        ERROR_CODES.UNKNOWN_PLAN,
        'The simulated plan is not available in the current scenario.',
        nextActions.simulate,
      )
    }

    const beforePolicy = current.committedPolicy
    const assumptions = freezeDeep({
      scenarioId: current.scenario.id,
      scenarioRevision: current.scenario.revision,
      workspaceRevision: current.workspaceRevision,
      forecastKind: current.forecastKind,
      battery: current.scenario.battery,
      outage: current.scenario.outage,
      solarKWh: Object.freeze([...current.scenario.solarKWh]),
      reserveKWh: current.scenario.battery.reserveKWh,
    })
    const proposalId = makeProposalId(
      current.sessionEpoch,
      current.workspaceRevision,
      cached.result,
    )
    const proposal = freezeDeep({
      proposalId,
      id: proposalId,
      status: 'staged' as const,
      baseRevision: current.workspaceRevision,
      currentRevision: current.workspaceRevision,
      simulationId: cached.result.simulationId,
      simulationFingerprint: cached.result.fingerprint,
      fingerprint: cached.result.fingerprint,
      scenarioId: cached.result.scenarioId,
      planId: cached.result.planId,
      planName: cached.result.planName,
      assumptions,
      simulation: cached.result,
      result: cached.result,
      beforePolicy,
      afterPolicy,
      before: beforePolicy,
      after: afterPolicy,
      diff: buildDiff(beforePolicy, afterPolicy),
    })
    const journal = appendJournal(current, 'proposal-staged', {
      proposalId,
      simulationId: proposal.simulationId,
      planId: proposal.planId,
      status: proposal.status,
      replacedProposalId: active?.proposalId,
    })
    invalidateCapabilities('other-mutation')
    publish(nextSnapshot({
      activeProposal: proposal,
      journal,
    }), true)
    return success(proposal)
  }

  const requestReview = (
    proposalInput: unknown,
    signal?: AbortSignal,
  ): StoreOutcome<ReviewResult> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const requestedEpoch = asInvocationEpoch(proposalInput)
    if (requestedEpoch !== undefined && requestedEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const proposalId = asProposalId(proposalInput)
    const active = current.activeProposal
    if (active === null) {
      return failure(
        ERROR_CODES.NO_PROPOSAL,
        'Stage a proposal before requesting review.',
        nextActions.stage,
      )
    }
    if (proposalId === null) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'A valid proposal ID is required to request review.',
        nextActions.review,
      )
    }
    if (active.proposalId !== proposalId) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The supplied proposal ID is not the active proposal.',
        nextActions.review,
      )
    }
    if (active.status === 'stale') {
      return failure(
        ERROR_CODES.STALE_PROPOSAL,
        'This proposal is stale because the workspace revision changed.',
        nextActions.restage,
      )
    }
    if (active.status === 'review-requested') {
      return success({
        proposal: active,
        proposalId,
        baseRevision: active.baseRevision,
        currentRevision: current.workspaceRevision,
      })
    }

    const reviewed = freezeDeep({
      ...active,
      status: 'review-requested' as const,
      currentRevision: current.workspaceRevision,
    })
    const journal = appendJournal(current, 'review-requested', {
      proposalId,
      planId: reviewed.planId,
      previousStatus: active.status,
      status: reviewed.status,
    })
    invalidateCapabilities('other-mutation')
    publish(nextSnapshot({
      activeProposal: reviewed,
      journal,
    }), true)
    return success({
      proposal: reviewed,
      proposalId,
      baseRevision: reviewed.baseRevision,
      currentRevision: current.workspaceRevision,
    })
  }

  const discardPlan = (
    proposalInput: unknown,
    signal?: AbortSignal,
  ): StoreOutcome<DiscardResult> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const requestedEpoch = asInvocationEpoch(proposalInput)
    if (requestedEpoch !== undefined && requestedEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const proposalId = asProposalId(proposalInput)
    if (proposalId === null) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'A valid proposal ID is required to discard a proposal.',
        nextActions.discard,
      )
    }
    const active = current.activeProposal
    if (active === null) {
      if (discardedProposalIds.has(proposalId)) {
        return success({
          proposalId,
          alreadyDiscarded: true,
          activeProposal: null,
        })
      }
      return failure(
        ERROR_CODES.NO_PROPOSAL,
        'There is no active proposal to discard.',
        nextActions.stage,
      )
    }
    if (active.proposalId !== proposalId) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The supplied proposal ID is not the active proposal.',
        nextActions.discard,
      )
    }

    discardedProposalIds.add(proposalId)
    const journal = appendJournal(current, 'proposal-discarded', {
      proposalId,
      planId: active.planId,
      previousStatus: active.status,
      status: active.status,
    })
    invalidateCapabilities('other-mutation')
    publish(nextSnapshot({
      activeProposal: null,
      journal,
    }), true)
    return success({
      proposalId,
      alreadyDiscarded: false,
      activeProposal: null,
    })
  }

  const createCommitCapability = (
    proposalInput: unknown,
  ): StoreOutcome<CommitCapability> => {
    const requestedEpoch = asInvocationEpoch(proposalInput)
    if (requestedEpoch !== undefined && requestedEpoch !== current.sessionEpoch) {
      return sessionMismatch()
    }
    const proposalId = asProposalId(proposalInput)
    const active = current.activeProposal
    if (active === null) {
      return failure(
        ERROR_CODES.NO_PROPOSAL,
        'Stage and review a proposal before opening commit confirmation.',
        nextActions.stage,
      )
    }
    if (proposalId === null) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'A valid proposal ID is required to open commit confirmation.',
        nextActions.review,
      )
    }
    if (active.proposalId !== proposalId) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The supplied proposal ID is not the active proposal.',
        nextActions.review,
      )
    }
    if (active.status === 'staged') {
      return failure(
        ERROR_CODES.REVIEW_REQUIRED,
        'Request review before creating a commit capability.',
        nextActions.review,
      )
    }
    if (active.status === 'stale') {
      return failure(
        ERROR_CODES.STALE_PROPOSAL,
        'The stale proposal must be restaged before it can be committed.',
        nextActions.restage,
      )
    }

    const capability = Object.freeze({
      sessionEpoch: current.sessionEpoch,
      epoch: current.sessionEpoch,
      proposalId,
      baseRevision: active.baseRevision,
      status: 'review-requested' as const,
      [capabilityBrand]: true,
    })
    capabilityRecords.set(capability, {
      epoch: current.sessionEpoch,
      proposalId,
      baseRevision: active.baseRevision,
      state: 'active',
    })
    activeCapabilities.add(capability)
    return success(capability)
  }

  const forgedCommitResult = (
    capability: unknown,
  ): StoreOutcome<CommitResult> => {
    if (typeof capability === 'string') {
      const active = current.activeProposal
      if (active?.proposalId === capability && active.status === 'staged') {
        return failure(
          ERROR_CODES.REVIEW_REQUIRED,
          'Request review before committing the proposal.',
          nextActions.review,
        )
      }
    }
    if (isRecord(capability)
      && typeof capability.proposalId === 'string'
      && Object.keys(capability).every((key) => key === 'proposalId')) {
      const active = current.activeProposal
      if (active?.proposalId === capability.proposalId && active.status === 'staged') {
        return failure(
          ERROR_CODES.REVIEW_REQUIRED,
          'Request review before committing the proposal.',
          nextActions.review,
        )
      }
    }
    return failure(
      ERROR_CODES.COMMIT_CAPABILITY_INVALID,
      'The human commit capability is invalid or has already been consumed.',
      nextActions.review,
    )
  }

  const commit = (
    capability: CommitCapability | unknown,
    signal?: AbortSignal,
  ): StoreOutcome<CommitResult> => {
    if (signal?.aborted) {
      return cancelled()
    }

    if (!isRecord(capability)) {
      return forgedCommitResult(capability)
    }
    const record = capabilityRecords.get(capability)
    if (record === undefined) {
      return forgedCommitResult(capability)
    }
    if (record.state === 'consumed') {
      return failure(
        ERROR_CODES.COMMIT_CAPABILITY_INVALID,
        'The human commit capability has already been consumed.',
        nextActions.undo,
      )
    }
    if (record.state === 'invalidated') {
      record.state = 'consumed'
      if (record.invalidationReason === 'competing-commit'
        || record.invalidationReason === 'revision-conflict') {
        if (record.invalidationReason === 'revision-conflict'
          && current.activeProposal?.proposalId === record.proposalId) {
          const active = current.activeProposal
          const journal = appendJournal(current, 'stale-rejection', {
            proposalId: active.proposalId,
            planId: active.planId,
            staleProposalId: active.proposalId,
            beforeRevision: active.baseRevision,
            afterRevision: current.workspaceRevision,
            status: active.status,
          })
          publish(nextSnapshot({ journal }), true)
        }
        return failure(
          ERROR_CODES.STALE_PROPOSAL,
          record.invalidationReason === 'competing-commit'
            ? 'The proposal was committed by another human activation first.'
            : 'The proposal is stale because the workspace revision changed.',
          record.invalidationReason === 'competing-commit'
            ? nextActions.undo
            : nextActions.restage,
        )
      }
      return failure(
        ERROR_CODES.COMMIT_CAPABILITY_INVALID,
        'The human commit capability is no longer current.',
        nextActions.review,
      )
    }

    record.state = 'consumed'
    activeCapabilities.delete(capability)
    if (record.epoch !== current.sessionEpoch) {
      return sessionMismatch()
    }

    const active = current.activeProposal
    if (active === null) {
      if (current.workspaceRevision > record.baseRevision) {
        return failure(
          ERROR_CODES.STALE_PROPOSAL,
          'The proposal is no longer current and was not committed.',
          nextActions.restage,
        )
      }
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The proposal is no longer active and was not committed.',
        nextActions.stage,
      )
    }
    if (active.proposalId !== record.proposalId) {
      return failure(
        ERROR_CODES.PROPOSAL_MISMATCH,
        'The commit capability does not match the active proposal.',
        nextActions.review,
      )
    }
    if (active.status === 'staged') {
      return failure(
        ERROR_CODES.REVIEW_REQUIRED,
        'Request review before committing the proposal.',
        nextActions.review,
      )
    }
    if (active.status === 'stale' || active.baseRevision !== current.workspaceRevision) {
      const journal = appendJournal(current, 'stale-rejection', {
        proposalId: active.proposalId,
        planId: active.planId,
        staleProposalId: active.proposalId,
        beforeRevision: active.baseRevision,
        afterRevision: current.workspaceRevision,
        status: active.status,
      })
      invalidateCapabilities('revision-conflict')
      publish(nextSnapshot({ journal }), true)
      return failure(
        ERROR_CODES.STALE_PROPOSAL,
        'The proposal is stale because the workspace revision changed.',
        nextActions.restage,
      )
    }

    const beforePolicy = current.committedPolicy
    const afterPolicy = active.afterPolicy
    const nextRevision = current.workspaceRevision + 1
    const journalSequence = current.journal.length + 1
    const commitId = `commit:${current.sessionEpoch}:${nextRevision}:${active.proposalId}`
    const journal = appendJournal(current, 'commit', {
      proposalId: active.proposalId,
      planId: active.planId,
      beforeRevision: current.workspaceRevision,
      afterRevision: nextRevision,
      beforePolicy,
      afterPolicy,
      status: active.status,
    }, nextRevision)
    const commitRecord = freezeDeep({
      commitId,
      proposalId: active.proposalId,
      revision: nextRevision,
      journalSequence,
      beforePolicy,
      afterPolicy,
    })
    invalidateCapabilities('competing-commit')
    publish(nextSnapshot({
      workspaceRevision: nextRevision,
      committedPolicy: afterPolicy,
      activeProposal: null,
      journal,
      lastCommit: commitRecord,
    }), true)
    return success({
      commitId,
      proposalId: active.proposalId,
      revision: nextRevision,
      beforePolicy,
      afterPolicy,
    })
  }

  const refreshForecast = (signal?: AbortSignal): StoreOutcome<ForecastRefreshResult> => {
    if (signal?.aborted) {
      return cancelled()
    }
    if (current.forecastKind === 'alternate') {
      return success({
        forecastKind: 'alternate',
        previousForecastKind: 'alternate',
        revision: current.workspaceRevision,
        previousRevision: current.workspaceRevision,
        proposal: current.activeProposal,
        alreadyRefreshed: true,
      })
    }

    const previousForecastKind = current.forecastKind
    const previousRevision = current.workspaceRevision
    const nextRevision = previousRevision + 1
    const staleProposal = current.activeProposal === null
      ? null
      : freezeDeep({
        ...current.activeProposal,
        status: 'stale' as const,
        currentRevision: nextRevision,
      })
    const journal = appendJournal(current, 'forecast-refreshed', {
      beforeForecast: previousForecastKind,
      afterForecast: 'alternate',
      beforeRevision: previousRevision,
      afterRevision: nextRevision,
      proposalId: staleProposal?.proposalId,
      staleProposalId: staleProposal?.proposalId,
      status: staleProposal?.status,
    }, nextRevision)
    invalidateCapabilities('revision-conflict')
    publish(nextSnapshot({
      workspaceRevision: nextRevision,
      forecastKind: 'alternate',
      scenario: alternateScenario,
      activeProposal: staleProposal,
      journal,
    }), true)
    return success({
      forecastKind: 'alternate',
      previousForecastKind,
      revision: nextRevision,
      previousRevision,
      proposal: staleProposal,
      alreadyRefreshed: false,
    })
  }

  const undo = (signal?: AbortSignal): StoreOutcome<UndoResult> => {
    if (signal?.aborted) {
      return cancelled()
    }
    const commitRecord = current.lastCommit
    if (commitRecord === null) {
      return failure(
        ERROR_CODES.UNDO_UNAVAILABLE,
        'There is no eligible committed change to undo.',
        nextActions.inspect,
      )
    }

    const beforePolicy = current.committedPolicy
    const afterPolicy = commitRecord.beforePolicy
    const nextRevision = current.workspaceRevision + 1
    const invalidatedProposal = current.activeProposal === null
      ? null
      : freezeDeep({
        ...current.activeProposal,
        status: 'stale' as const,
        currentRevision: nextRevision,
      })
    const journal = appendJournal(current, 'undo', {
      proposalId: commitRecord.proposalId,
      revertedCommitId: commitRecord.commitId,
      beforeRevision: current.workspaceRevision,
      afterRevision: nextRevision,
      beforePolicy,
      afterPolicy,
      staleProposalId: invalidatedProposal?.proposalId,
    }, nextRevision)
    invalidateCapabilities('other-mutation')
    publish(nextSnapshot({
      workspaceRevision: nextRevision,
      committedPolicy: afterPolicy,
      activeProposal: invalidatedProposal,
      journal,
      lastCommit: null,
    }), true)
    return success({
      revertedCommitId: commitRecord.commitId,
      revision: nextRevision,
      beforePolicy,
      afterPolicy,
    })
  }

  const reset = (signal?: AbortSignal): StoreOutcome<ResetResult> => {
    if (signal?.aborted) {
      return cancelled()
    }

    const archivedSessionEpoch = current.sessionEpoch
    const archivedSnapshot = freezeDeep({
      sessionEpoch: archivedSessionEpoch,
      workspaceRevision: current.workspaceRevision,
      forecastKind: current.forecastKind,
      committedPolicy: current.committedPolicy,
      activeProposal: current.activeProposal,
      journal: current.journal,
    })
    const archived = freezeDeep({
      sessionEpoch: archivedSessionEpoch,
      workspaceRevision: current.workspaceRevision,
      forecastKind: current.forecastKind,
      committedPolicy: current.committedPolicy,
      activeProposal: current.activeProposal,
      journal: current.journal,
      snapshot: archivedSnapshot,
    })

    const sessionEpoch = current.sessionEpoch + 1
    const scenario = canonicalScenario
    const policy = buildInitialPolicy(scenario)
    const resetJournal = freezeDeep({
      id: `journal:${sessionEpoch}:1`,
      sequence: 1,
      event: 'session-reset' as const,
      type: 'session-reset' as const,
      sessionEpoch,
      workspaceRevision: 1,
      archivedSessionEpoch,
      beforeRevision: current.workspaceRevision,
      afterRevision: 1,
    })

    const cleared = clearPersistedState(storage, storageKey)
    const resetCanPersist = cleared.ok && storage !== null
    invalidateCapabilities('other-mutation')
    discardedProposalIds.clear()
    publish(buildSnapshot({
      sessionEpoch,
      workspaceRevision: 1,
      forecastKind: 'canonical',
      scenario,
      committedPolicy: policy,
      activeProposal: null,
      simulations: [],
      comparisons: [],
      explanations: [],
      journal: [resetJournal],
      archivedSessions: [...current.archivedSessions, archived],
      persistenceMode: resetCanPersist ? 'persistent' : 'memory-only',
      persistenceIssue: resetCanPersist ? null : cleared.issue,
      lastCommit: null,
    }), resetCanPersist)
    return success({
      sessionEpoch,
      revision: 1,
      archivedSessionEpoch,
      archivedJournalLength: archived.journal.length,
    })
  }

  const agent = Object.freeze({
    inspectHome,
    inspectOutage,
    simulatePlan,
    comparePlans,
    explainInterval,
    stagePlan,
    requestReview,
    discardPlan,
    simulate: simulatePlan,
    compare: comparePlans,
    explain: explainInterval,
    stage: stagePlan,
    review: requestReview,
    discard: discardPlan,
  }) satisfies AgentCommands

  const human = Object.freeze({
    createCommitCapability,
    prepareCommit: createCommitCapability,
    commit,
    refreshForecast,
    refresh: refreshForecast,
    undo,
    undoLatest: undo,
    reset,
  }) satisfies HumanCommands

  return Object.freeze({
    getSnapshot: (): StoreSnapshot => current,
    subscribe: (listener: (snapshot?: StoreSnapshot) => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    agent,
    human,
  })
}

export const createWattKeepStore = createStore
export const createAppStore = createStore
export const store = createStore()
export default store
