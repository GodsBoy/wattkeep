import { ERROR_CODES } from '../domain/outcomes'
import type { AgentCommands } from '../state/store'
import type {
  ModelContext,
  ModelContextTool,
  ModelContextToolExecutionContext,
} from './model-context'
import {
  MAX_ACTION_LENGTH,
  MAX_NEXT_ACTIONS,
  TOOL_CONTRACTS,
  TOOL_NAMES,
  type ToolEnvelope,
  type ToolError,
  type ToolName,
  type ToolSource,
  type ToolState,
  validateToolInput,
} from './contracts'

const CANCELLED_MESSAGE = 'The operation was cancelled before it completed.'
const INTERNAL_ERROR_MESSAGE = 'The operation could not be completed safely.'
const REGISTRATION_CANCELLED_REASON = 'WebMCP registration was cancelled; use the manual interface.'
const DEFAULT_PERSISTENCE_MODE = 'memory-only' as const

const FORBIDDEN_ACTION_WORDS = /\b(?:approve|commit|refresh|reset|undo)\b/i

const DEFAULT_NEXT_ACTIONS: Readonly<Record<ToolName, readonly string[]>> = Object.freeze({
  inspect_home: Object.freeze(['Inspect the current outage conditions.']),
  inspect_outage: Object.freeze(['Simulate a plan for the current outage.']),
  simulate_plan: Object.freeze([
    'Stage this simulation if it is feasible.',
    'Explain an interval from this simulation.',
  ]),
  compare_plans: Object.freeze(['Choose a feasible plan to stage.']),
  stage_plan: Object.freeze(['Request human review of the staged proposal.']),
  explain_interval: Object.freeze(['Use this interval evidence during proposal review.']),
  discard_plan: Object.freeze(['Simulate another plan for the current outage.']),
  request_review: Object.freeze(['Review the staged proposal in the WattKeep interface.']),
})

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const boundedText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback
  }
  return value.slice(0, MAX_ACTION_LENGTH)
}

const safeActions = (value: unknown, fallback: readonly string[]): readonly string[] => {
  const source = Array.isArray(value) ? value : fallback
  const actions = source
    .filter((action): action is string => typeof action === 'string')
    .map((action) => action.trim())
    .filter((action) => action.length > 0 && !FORBIDDEN_ACTION_WORDS.test(action))
    .slice(0, MAX_NEXT_ACTIONS)
    .map((action) => action.slice(0, MAX_ACTION_LENGTH))

  if (actions.length > 0) {
    return Object.freeze(actions)
  }

  return Object.freeze(fallback
    .filter((action) => !FORBIDDEN_ACTION_WORDS.test(action))
    .slice(0, MAX_NEXT_ACTIONS)
    .map((action) => action.slice(0, MAX_ACTION_LENGTH)))
}

type CompactJson = null | boolean | number | string | readonly CompactJson[] | {
  readonly [key: string]: CompactJson
}

const compactJson = (value: unknown, depth = 0): CompactJson => {
  if (value === null) {
    return null
  }
  if (typeof value === 'string') {
    return value.slice(0, 4096)
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (depth >= 8) {
    return null
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.slice(0, 64).map((item) => compactJson(item, depth + 1)))
  }
  if (!isRecord(value)) {
    return null
  }

  const result: Record<string, CompactJson> = {}
  for (const key of Object.keys(value).slice(0, 96)) {
    try {
      result[key] = compactJson(value[key], depth + 1)
    } catch {
      result[key] = null
    }
  }
  return Object.freeze(result)
}

const readField = (value: unknown, key: string): unknown => {
  if (!isRecord(value)) {
    return undefined
  }

  try {
    return value[key]
  } catch {
    return undefined
  }
}

const compactFields = (
  fields: readonly (readonly [string, unknown])[],
): CompactJson => compactJson(Object.fromEntries(fields))

const compactStringArray = (value: unknown): CompactJson => (
  Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 64)
      .map((item) => item.slice(0, 256))
    : []
)

const compactNumberArray = (value: unknown): CompactJson => (
  Array.isArray(value)
    ? value
      .slice(0, 64)
      .map((item) => typeof item === 'number' && Number.isFinite(item) ? item : null)
    : []
)

const compactBattery = (value: unknown): CompactJson => compactFields([
  ['capacityKWh', readField(value, 'capacityKWh')],
  ['startEnergyKWh', readField(value, 'startEnergyKWh')],
  ['reserveKWh', readField(value, 'reserveKWh')],
])

const compactOutage = (value: unknown): CompactJson => compactFields([
  ['start', readField(value, 'start')],
  ['end', readField(value, 'end')],
  ['intervalHours', readField(value, 'intervalHours')],
  ['intervalCount', readField(value, 'intervalCount')],
])

const compactAssumptions = (value: unknown): CompactJson => compactFields([
  ['scenarioRevision', readField(value, 'scenarioRevision')],
  ['workspaceRevision', readField(value, 'workspaceRevision')],
  ['forecastKind', readField(value, 'forecastKind')],
  ['battery', compactBattery(readField(value, 'battery'))],
  ['outage', compactOutage(readField(value, 'outage'))],
  ['solarKWh', compactNumberArray(readField(value, 'solarKWh'))],
  ['reserveKWh', readField(value, 'reserveKWh')],
])

const compactSimulationSummary = (value: unknown): CompactJson => compactFields([
  ['endEnergyKWh', readField(value, 'endEnergyKWh')],
  ['endChargePercent', readField(value, 'endChargePercent')],
  ['feasible', readField(value, 'feasible')],
  ['firstBreachIndex', readField(value, 'firstBreachIndex')],
  ['coverage', readField(value, 'coverage')],
])

const compactPolicy = (value: unknown): CompactJson => compactFields([
  ['planId', readField(value, 'planId')],
  ['planName', readField(value, 'planName')],
  ['loadIds', compactStringArray(readField(value, 'loadIds'))],
])

const compactDiff = (value: unknown): CompactJson => compactFields([
  ['addedLoadIds', compactStringArray(readField(value, 'addedLoadIds'))],
  ['removedLoadIds', compactStringArray(readField(value, 'removedLoadIds'))],
  ['unchangedLoadIds', compactStringArray(readField(value, 'unchangedLoadIds'))],
  ['changed', readField(value, 'changed')],
])

const compactProposal = (
  value: unknown,
  wrapper?: unknown,
): CompactJson => {
  if (!isRecord(value)) {
    return null
  }

  const proposal = value
  const field = (key: string): unknown => {
    const wrapped = readField(wrapper, key)
    return wrapped === undefined ? readField(proposal, key) : wrapped
  }
  const simulation = readField(proposal, 'simulation') ?? readField(proposal, 'result')
  const beforePolicy = readField(proposal, 'beforePolicy') ?? readField(proposal, 'before')
  const afterPolicy = readField(proposal, 'afterPolicy') ?? readField(proposal, 'after')
  const simulationFingerprint = field('simulationFingerprint') ?? field('fingerprint')

  // Proposal and StoreSnapshot intentionally retain compatibility aliases for
  // the UI. The agent surface returns one canonical copy of each large value,
  // with interval evidence available through simulate_plan and explain_interval.
  return compactFields([
    ['proposalId', field('proposalId')],
    ['status', field('status')],
    ['baseRevision', field('baseRevision')],
    ['currentRevision', field('currentRevision')],
    ['simulationId', field('simulationId') ?? readField(simulation, 'simulationId')],
    ['simulationFingerprint', simulationFingerprint ?? readField(simulation, 'fingerprint')],
    ['scenarioId', field('scenarioId') ?? readField(simulation, 'scenarioId')],
    ['planId', field('planId') ?? readField(simulation, 'planId')],
    ['planName', field('planName') ?? readField(simulation, 'planName')],
    ['assumptions', compactAssumptions(readField(proposal, 'assumptions'))],
    ['simulation', compactSimulationSummary(simulation)],
    ['beforePolicy', compactPolicy(beforePolicy)],
    ['afterPolicy', compactPolicy(afterPolicy)],
    ['diff', compactDiff(readField(proposal, 'diff'))],
  ])
}

const compactRankedPlan = (value: unknown): CompactJson => {
  if (!isRecord(value)) {
    return null
  }

  const simulation = readField(value, 'simulation')
  return compactFields([
    ['rank', readField(value, 'rank')],
    ['planId', readField(value, 'planId') ?? readField(simulation, 'planId')],
    ['planName', readField(value, 'planName') ?? readField(simulation, 'planName')],
    ['simulationId', readField(simulation, 'simulationId')],
    ['fingerprint', readField(simulation, 'fingerprint')],
    ['feasible', readField(simulation, 'feasible')],
    ['coverage', readField(simulation, 'coverage')],
    ['endEnergyKWh', readField(simulation, 'endEnergyKWh')],
    ['endChargePercent', readField(simulation, 'endChargePercent')],
    ['firstBreachIndex', readField(simulation, 'firstBreachIndex')],
    ['tradeOffReason', readField(value, 'tradeOffReason')],
  ])
}

const compactComparison = (value: unknown): CompactJson => {
  const ranked = readField(value, 'ranked')
  return compactFields([
    ['requestedPlanIds', compactStringArray(readField(value, 'requestedPlanIds'))],
    ['ranked', Array.isArray(ranked)
      ? ranked.slice(0, 3).map((item) => compactRankedPlan(item))
      : []],
  ])
}

const compactData = (tool: ToolName, value: unknown): CompactJson => {
  if (tool === 'stage_plan') {
    return compactProposal(value)
  }
  if (tool === 'request_review' && isRecord(value)) {
    const proposal = readField(value, 'proposal')
    return compactProposal(proposal, value)
  }
  if (tool === 'compare_plans') {
    return compactComparison(value)
  }
  return compactJson(value)
}

const defaultState = (nextActions: readonly string[]): ToolState => ({
  sessionEpoch: 0,
  workspaceRevision: 0,
  activeProposal: null,
  persistenceMode: DEFAULT_PERSISTENCE_MODE,
  nextActions: safeActions(nextActions, ['Retry the operation.']),
})

const readLiveState = (
  source: ToolSource,
  nextActions: readonly string[],
): ToolState => {
  try {
    const snapshot = source.getSnapshot()
    const proposal = snapshot.activeProposal
    const activeProposal = proposal === null
      ? null
      : isRecord(proposal)
        && typeof proposal.proposalId === 'string'
        && (proposal.status === 'staged'
          || proposal.status === 'review-requested'
          || proposal.status === 'stale')
        ? {
          proposalId: proposal.proposalId,
          status: proposal.status,
        }
        : null

    return {
      sessionEpoch: Number.isFinite(snapshot.sessionEpoch) ? snapshot.sessionEpoch : 0,
      workspaceRevision: Number.isFinite(snapshot.workspaceRevision)
        ? snapshot.workspaceRevision
        : 0,
      activeProposal,
      persistenceMode: snapshot.persistenceMode === 'persistent'
        ? 'persistent'
        : DEFAULT_PERSISTENCE_MODE,
      nextActions: safeActions(nextActions, ['Retry the operation.']),
    }
  } catch {
    return defaultState(nextActions)
  }
}

const makeError = (
  code: string,
  message: string,
  nextActions: readonly string[],
): ToolError => ({
  code: /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : ERROR_CODES.INTERNAL_ERROR,
  message: boundedText(message, INTERNAL_ERROR_MESSAGE),
  nextActions: safeActions(nextActions, ['Retry the operation.']),
})

const cancellationError = (): ToolError => makeError(
  ERROR_CODES.CANCELLED,
  CANCELLED_MESSAGE,
  ['Retry the operation.'],
)

const internalError = (): ToolError => makeError(
  ERROR_CODES.INTERNAL_ERROR,
  INTERNAL_ERROR_MESSAGE,
  ['Retry the operation.'],
)

const outcomeError = (value: unknown): ToolError | null => {
  if (!isRecord(value)) {
    return null
  }
  const code = typeof value.code === 'string' ? value.code : ''
  const message = typeof value.message === 'string' ? value.message : ''
  if (code.length === 0 || message.length === 0) {
    return null
  }
  return makeError(
    code,
    message,
    Array.isArray(value.nextActions) ? value.nextActions : [],
  )
}

const isSuccessfulOutcome = (
  value: unknown,
): value is { readonly ok: true; readonly data: unknown } => (
  isRecord(value) && value.ok === true
)

const isFailedOutcome = (
  value: unknown,
): value is { readonly ok: false; readonly error: unknown } => (
  isRecord(value) && value.ok === false
)

const envelopeFromOutcome = (
  tool: ToolName,
  source: ToolSource,
  outcome: unknown,
  fallbackActions: readonly string[],
): ToolEnvelope => {
  if (isSuccessfulOutcome(outcome)) {
    return {
      ok: true,
      tool,
      data: compactData(tool, outcome.data),
      state: readLiveState(source, fallbackActions),
    }
  }

  if (isFailedOutcome(outcome)) {
    const error = outcomeError(outcome.error)
    if (error !== null) {
      return {
        ok: false,
        tool,
        error,
        state: readLiveState(source, error.nextActions),
      }
    }
  }

  const error = internalError()
  return {
    ok: false,
    tool,
    error,
    state: readLiveState(source, error.nextActions),
  }
}

const cancellationEnvelope = (
  tool: ToolName,
  source: ToolSource,
): ToolEnvelope => {
  const error = cancellationError()
  return {
    ok: false,
    tool,
    error,
    state: readLiveState(source, error.nextActions),
  }
}

const invokeTool = async (
  tool: ToolName,
  input: unknown,
  source: ToolSource,
  signal?: AbortSignal,
): Promise<ToolEnvelope> => {
  if (signal?.aborted) {
    return cancellationEnvelope(tool, source)
  }

  const validation = validateToolInput(tool, input)
  if (!validation.ok) {
    return {
      ok: false,
      tool,
      error: makeError(
        validation.error.code,
        validation.error.message,
        validation.error.nextActions,
      ),
      state: readLiveState(source, validation.error.nextActions),
    }
  }

  try {
    const agent: AgentCommands = source.agent
    let outcome: unknown

    switch (tool) {
      case 'inspect_home':
        outcome = agent.inspectHome(signal)
        break
      case 'inspect_outage':
        outcome = agent.inspectOutage(signal)
        break
      case 'simulate_plan':
        outcome = await agent.simulatePlan(
          validation.data as { readonly planId: string },
          signal,
        )
        break
      case 'compare_plans':
        outcome = await agent.comparePlans(
          validation.data as { readonly planIds: readonly string[] },
          signal,
        )
        break
      case 'stage_plan':
        outcome = agent.stagePlan(
          validation.data as { readonly simulationId: string; readonly replaceProposalId?: string },
          signal,
        )
        break
      case 'explain_interval':
        outcome = await agent.explainInterval(
          validation.data as { readonly simulationId: string; readonly intervalIndex: number },
          undefined,
          signal,
        )
        break
      case 'discard_plan':
        outcome = agent.discardPlan(
          validation.data as { readonly proposalId: string },
          signal,
        )
        break
      case 'request_review':
        outcome = agent.requestReview(
          validation.data as { readonly proposalId: string },
          signal,
        )
        break
      default:
        return {
          ok: false,
          tool,
          error: internalError(),
          state: readLiveState(source, ['Retry the operation.']),
        }
    }

    // Read-only work is allowed to be cancelled while it is awaiting the
    // store's calculation. Mutating commands return the linearised result,
    // even if cancellation fires immediately afterwards.
    if ((tool === 'simulate_plan'
      || tool === 'compare_plans'
      || tool === 'explain_interval') && signal?.aborted) {
      return cancellationEnvelope(tool, source)
    }

    return envelopeFromOutcome(tool, source, outcome, DEFAULT_NEXT_ACTIONS[tool])
  } catch {
    const error = internalError()
    return {
      ok: false,
      tool,
      error,
      state: readLiveState(source, error.nextActions),
    }
  }
}

export const createWebMcpTools = (source: ToolSource): readonly ModelContextTool[] => (
  Object.freeze(TOOL_CONTRACTS.map((contract) => Object.freeze({
    ...contract,
    execute: (
      input: unknown,
      context: ModelContextToolExecutionContext,
    ): Promise<ToolEnvelope> => invokeTool(
      contract.name,
      input,
      source,
      context?.signal,
    ),
  })))
)

export type WebMcpRegistrationMode = 'webmcp' | 'manual'

export interface WebMcpRegistration {
  readonly mode: WebMcpRegistrationMode
  readonly status: 'registered' | 'manual'
  readonly registered: boolean
  readonly toolNames: readonly ToolName[]
  readonly reason?: string
  readonly cleanup: () => void
}

const manualRegistration = (reason: string): WebMcpRegistration => ({
  mode: 'manual',
  status: 'manual',
  registered: false,
  toolNames: Object.freeze([]),
  reason,
  cleanup: () => undefined,
})

const resolveModelContext = (
  target: Document | ModelContext | null | undefined,
): ModelContext | null => {
  if (!isRecord(target)) {
    return null
  }

  try {
    if (typeof target.registerTool === 'function') {
      return target as unknown as ModelContext
    }
    const context = target.modelContext
    if (isRecord(context) && typeof context.registerTool === 'function') {
      return context as unknown as ModelContext
    }
  } catch {
    return null
  }

  return null
}

const registrationFailureReason = (error: unknown): string => {
  if (isRecord(error) && error.name === 'AbortError') {
    return REGISTRATION_CANCELLED_REASON
  }
  if (isRecord(error)
    && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'WebMCP registration was not permitted; use the manual interface.'
  }
  return 'WebMCP registration failed; use the manual interface.'
}

/**
 * Registers the page-scoped agent surface when WebMCP is available. The
 * returned lifecycle cleanup aborts the registration signal, which is the
 * WebMCP unregister mechanism. An optional caller signal is bound to the
 * same lifecycle so pending registration can be cancelled by its owner.
 */
export const registerWebMcpTools = async (
  target: Document | ModelContext | null | undefined,
  source: ToolSource,
  callerSignal?: AbortSignal,
): Promise<WebMcpRegistration> => {
  const context = resolveModelContext(target)
  if (context === null) {
    return manualRegistration('WebMCP is unavailable in this browser; use the manual interface.')
  }

  let lifecycle: AbortController
  try {
    lifecycle = new AbortController()
  } catch {
    return manualRegistration('WebMCP could not start safely; use the manual interface.')
  }

  const tools = createWebMcpTools(source)
  let cleaned = false
  let callerListenerAttached = false
  const onCallerAbort = (): void => {
    cleanup()
  }
  const detachCallerSignal = (): void => {
    if (!callerListenerAttached || callerSignal === undefined) {
      return
    }
    callerListenerAttached = false
    try {
      callerSignal.removeEventListener('abort', onCallerAbort)
    } catch {
      // A native AbortSignal does not throw here. Cleanup must still abort the
      // registration lifecycle if a host supplies an unusual signal object.
    }
  }
  const cleanup = (): void => {
    if (cleaned) {
      return
    }
    cleaned = true
    detachCallerSignal()
    lifecycle.abort()
  }

  if (callerSignal !== undefined) {
    if (callerSignal.aborted) {
      cleanup()
      return {
        ...manualRegistration(REGISTRATION_CANCELLED_REASON),
        cleanup,
      }
    }

    callerListenerAttached = true
    try {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    } catch {
      cleanup()
      return {
        ...manualRegistration('WebMCP could not bind its registration lifecycle; use the manual interface.'),
        cleanup,
      }
    }
    // Abort can race with listener attachment in host implementations that
    // provide an AbortSignal-like object rather than the native signal.
    if (callerSignal.aborted) {
      cleanup()
      return {
        ...manualRegistration(REGISTRATION_CANCELLED_REASON),
        cleanup,
      }
    }
  }

  try {
    for (const tool of tools) {
      await context.registerTool(tool, { signal: lifecycle.signal })
      if (lifecycle.signal.aborted) {
        throw new Error('registration lifecycle closed')
      }
    }
  } catch (error) {
    const reason = lifecycle.signal.aborted
      ? REGISTRATION_CANCELLED_REASON
      : registrationFailureReason(error)
    cleanup()
    return {
      ...manualRegistration(reason),
      cleanup,
    }
  }

  return {
    mode: 'webmcp',
    status: 'registered',
    registered: true,
    toolNames: TOOL_NAMES,
    cleanup,
  }
}
