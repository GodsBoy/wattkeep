import type {
  AgentCommands,
  ProposalStatus,
  WattKeepStore,
} from '../state/store'
import type { PlanId } from '../domain/types'
import type { PersistenceMode } from '../state/persistence'

export const PLAN_IDS = Object.freeze([
  'essential-reserve',
  'balanced-night',
  'comfort-carry',
] as const satisfies readonly PlanId[])

export type ToolName =
  | 'inspect_home'
  | 'inspect_outage'
  | 'simulate_plan'
  | 'compare_plans'
  | 'stage_plan'
  | 'explain_interval'
  | 'discard_plan'
  | 'request_review'

export const TOOL_NAMES = Object.freeze([
  'inspect_home',
  'inspect_outage',
  'simulate_plan',
  'compare_plans',
  'stage_plan',
  'explain_interval',
  'discard_plan',
  'request_review',
] as const satisfies readonly ToolName[])

export const MAX_ID_LENGTH = 256
export const MAX_NEXT_ACTIONS = 3
export const MAX_ACTION_LENGTH = 160

export interface JsonSchema {
  readonly [key: string]: unknown
  readonly type: 'object' | 'string' | 'array' | 'integer'
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly items?: JsonSchema
  readonly required?: readonly string[]
  readonly additionalProperties?: false
  readonly enum?: readonly string[]
  readonly minItems?: number
  readonly maxItems?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly minimum?: number
  readonly maximum?: number
  readonly uniqueItems?: boolean
}

const objectSchema = (
  properties: Readonly<Record<string, JsonSchema>>,
  required: readonly string[],
): JsonSchema => Object.freeze({
  type: 'object',
  properties: Object.freeze(properties),
  required: Object.freeze([...required]),
  additionalProperties: false,
})

const stringSchema = (options: {
  readonly enum?: readonly string[]
  readonly minLength?: number
  readonly maxLength?: number
} = {}): JsonSchema => Object.freeze({
  type: 'string',
  ...options,
})

const planSchema = stringSchema({ enum: PLAN_IDS })

const boundedIdSchema = stringSchema({
  minLength: 1,
  maxLength: MAX_ID_LENGTH,
})

export const TOOL_SCHEMAS: Readonly<Record<ToolName, JsonSchema>> = Object.freeze({
  inspect_home: objectSchema({}, []),
  inspect_outage: objectSchema({}, []),
  simulate_plan: objectSchema({ planId: planSchema }, ['planId']),
  compare_plans: objectSchema({
    planIds: Object.freeze({
      type: 'array',
      items: planSchema,
      minItems: 2,
      maxItems: 3,
      uniqueItems: true,
    }),
  }, ['planIds']),
  stage_plan: objectSchema({
    simulationId: boundedIdSchema,
    replaceProposalId: boundedIdSchema,
  }, ['simulationId']),
  explain_interval: objectSchema({
    simulationId: boundedIdSchema,
    intervalIndex: Object.freeze({
      type: 'integer',
      minimum: 0,
      maximum: 11,
    }),
  }, ['simulationId', 'intervalIndex']),
  discard_plan: objectSchema({ proposalId: boundedIdSchema }, ['proposalId']),
  request_review: objectSchema({ proposalId: boundedIdSchema }, ['proposalId']),
})

const TOOL_TITLES: Readonly<Record<ToolName, string>> = Object.freeze({
  inspect_home: 'Inspect home',
  inspect_outage: 'Inspect outage',
  simulate_plan: 'Simulate plan',
  compare_plans: 'Compare plans',
  stage_plan: 'Stage plan',
  explain_interval: 'Explain interval',
  discard_plan: 'Discard plan',
  request_review: 'Request review',
})

const TOOL_DESCRIPTIONS: Readonly<Record<ToolName, string>> = Object.freeze({
  inspect_home: 'Read the current household, battery, loads, and policy.',
  inspect_outage: 'Read the current outage window, intervals, and solar forecast.',
  simulate_plan: 'Calculate one energy plan for the current household and outage.',
  compare_plans: 'Rank two or three energy plans by reserve safety and coverage.',
  stage_plan: 'Stage a feasible simulation as a visible proposal for human review.',
  explain_interval: 'Explain one interval from a cached plan simulation.',
  discard_plan: 'Discard an active proposal without applying household settings.',
  request_review: 'Request human review of the active proposal before applying settings.',
})

const READ_ONLY_TOOLS = new Set<ToolName>([
  'inspect_home',
  'inspect_outage',
  'simulate_plan',
  'compare_plans',
  'explain_interval',
])

export interface ToolContract {
  readonly name: ToolName
  readonly title: string
  readonly description: string
  readonly inputSchema: JsonSchema
  readonly annotations: {
    readonly readOnlyHint: boolean
    readonly untrustedContentHint: false
  }
}

export const TOOL_CONTRACTS: readonly ToolContract[] = Object.freeze(
  TOOL_NAMES.map((name) => Object.freeze({
    name,
    title: TOOL_TITLES[name],
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: TOOL_SCHEMAS[name],
    annotations: Object.freeze({
      readOnlyHint: READ_ONLY_TOOLS.has(name),
      untrustedContentHint: false as const,
    }),
  })),
)

export type EmptyInput = Record<string, never>

export interface SimulatePlanInput {
  readonly planId: PlanId
}

export interface ComparePlansInput {
  readonly planIds: readonly PlanId[]
}

export interface StagePlanInput {
  readonly simulationId: string
  readonly replaceProposalId?: string
}

export interface ExplainIntervalInput {
  readonly simulationId: string
  readonly intervalIndex: number
}

export interface ProposalInput {
  readonly proposalId: string
}

export type ToolInput =
  | EmptyInput
  | SimulatePlanInput
  | ComparePlansInput
  | StagePlanInput
  | ExplainIntervalInput
  | ProposalInput

export type ValidationErrorCode = 'INVALID_INPUT'

export interface InputValidationError {
  readonly code: ValidationErrorCode
  readonly message: string
  readonly nextActions: readonly string[]
}

export type InputValidationResult<Input extends ToolInput = ToolInput> =
  | { readonly ok: true; readonly data: Input }
  | { readonly ok: false; readonly error: InputValidationError }

const invalidInput = <Input extends ToolInput = ToolInput>(
  message: string,
): InputValidationResult<Input> => ({
  ok: false,
  error: {
    code: 'INVALID_INPUT',
    message,
    nextActions: Object.freeze(['Provide input matching the tool schema.']),
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional])
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string' || !allowed.has(key))) {
    return false
  }

  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

const isBoundedString = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length >= 1
  && value.length <= MAX_ID_LENGTH
  && value.trim() === value
  && [...value].every((character) => {
    const code = character.codePointAt(0) ?? 0
    return code >= 0x20 && code !== 0x7f
  })
)

const isPlanId = (value: unknown): value is PlanId => (
  typeof value === 'string'
  && (PLAN_IDS as readonly string[]).includes(value)
)

const validateEmpty = (input: unknown): InputValidationResult<EmptyInput> => {
  if (!isRecord(input) || !hasExactKeys(input, [])) {
    return invalidInput<EmptyInput>('This tool does not accept input properties.')
  }

  return { ok: true, data: input as EmptyInput }
}

const validateSimulate = (
  input: unknown,
): InputValidationResult<SimulatePlanInput> => {
  if (!isRecord(input) || !hasExactKeys(input, ['planId']) || !isPlanId(input.planId)) {
    return invalidInput<SimulatePlanInput>('planId must be one of the available plan IDs.')
  }

  return { ok: true, data: { planId: input.planId } }
}

const validateCompare = (
  input: unknown,
): InputValidationResult<ComparePlansInput> => {
  if (!isRecord(input) || !hasExactKeys(input, ['planIds']) || !Array.isArray(input.planIds)) {
    return invalidInput<ComparePlansInput>('planIds must contain two or three different plan IDs.')
  }

  const planIds = input.planIds
  if (planIds.length < 2 || planIds.length > 3
    || new Set(planIds).size !== planIds.length
    || planIds.some((planId) => !isPlanId(planId))) {
    return invalidInput<ComparePlansInput>('planIds must contain two or three different plan IDs.')
  }

  return {
    ok: true,
    data: { planIds: Object.freeze([...planIds] as PlanId[]) },
  }
}

const validateStage = (
  input: unknown,
): InputValidationResult<StagePlanInput> => {
  if (!isRecord(input)
    || !hasExactKeys(input, ['simulationId'], ['replaceProposalId'])
    || !isBoundedString(input.simulationId)
    || (Object.prototype.hasOwnProperty.call(input, 'replaceProposalId')
      && !isBoundedString(input.replaceProposalId))) {
    return invalidInput<StagePlanInput>('simulationId and replaceProposalId must be bounded strings.')
  }

  return {
    ok: true,
    data: Object.prototype.hasOwnProperty.call(input, 'replaceProposalId')
      ? {
        simulationId: input.simulationId,
        replaceProposalId: input.replaceProposalId as string,
      }
      : { simulationId: input.simulationId },
  }
}

const validateExplain = (
  input: unknown,
): InputValidationResult<ExplainIntervalInput> => {
  if (!isRecord(input)
    || !hasExactKeys(input, ['simulationId', 'intervalIndex'])
    || !isBoundedString(input.simulationId)
    || typeof input.intervalIndex !== 'number'
    || !Number.isInteger(input.intervalIndex)
    || input.intervalIndex < 0
    || input.intervalIndex > 11) {
    return invalidInput<ExplainIntervalInput>('simulationId must be a bounded string and intervalIndex must be 0 through 11.')
  }

  return {
    ok: true,
    data: {
      simulationId: input.simulationId,
      intervalIndex: input.intervalIndex,
    },
  }
}

const validateProposal = (
  input: unknown,
): InputValidationResult<ProposalInput> => {
  if (!isRecord(input)
    || !hasExactKeys(input, ['proposalId'])
    || !isBoundedString(input.proposalId)) {
    return invalidInput<ProposalInput>('proposalId must be a bounded string.')
  }

  return { ok: true, data: { proposalId: input.proposalId } }
}

export const validateToolInput = (
  tool: string,
  input: unknown,
): InputValidationResult => {
  try {
    switch (tool) {
      case 'inspect_home':
      case 'inspect_outage':
        return validateEmpty(input)
      case 'simulate_plan':
        return validateSimulate(input)
      case 'compare_plans':
        return validateCompare(input)
      case 'stage_plan':
        return validateStage(input)
      case 'explain_interval':
        return validateExplain(input)
      case 'discard_plan':
      case 'request_review':
        return validateProposal(input)
      default:
        return invalidInput('The requested tool is not available.')
    }
  } catch {
    return invalidInput('Input could not be read safely.')
  }
}

export interface ToolState {
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly activeProposal: {
    readonly proposalId: string
    readonly status: ProposalStatus
  } | null
  readonly persistenceMode: PersistenceMode
  readonly nextActions: readonly string[]
}

export interface ToolError {
  readonly code: string
  readonly message: string
  readonly nextActions: readonly string[]
}

export interface ToolSuccessEnvelope<Data = unknown> {
  readonly ok: true
  readonly tool: ToolName
  readonly data: Data
  readonly state: ToolState
}

export interface ToolFailureEnvelope {
  readonly ok: false
  readonly tool: ToolName
  readonly error: ToolError
  readonly state: ToolState
}

export type ToolEnvelope<Data = unknown> =
  | ToolSuccessEnvelope<Data>
  | ToolFailureEnvelope

export interface ToolSource {
  readonly getSnapshot: WattKeepStore['getSnapshot']
  readonly agent: AgentCommands
}
