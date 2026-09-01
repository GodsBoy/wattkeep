const ERROR_CODE_VALUES = {
  UNKNOWN_PLAN: 'UNKNOWN_PLAN',
  INVALID_PLAN_COUNT: 'INVALID_PLAN_COUNT',
  DUPLICATE_PLAN: 'DUPLICATE_PLAN',
  INVALID_INTERVAL: 'INVALID_INTERVAL',
  CANCELLED: 'CANCELLED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_SIMULATION: 'UNKNOWN_SIMULATION',
  STALE_SIMULATION: 'STALE_SIMULATION',
  INFEASIBLE_PLAN: 'INFEASIBLE_PLAN',
  ACTIVE_PROPOSAL: 'ACTIVE_PROPOSAL',
  PROPOSAL_MISMATCH: 'PROPOSAL_MISMATCH',
  NO_PROPOSAL: 'NO_PROPOSAL',
  STALE_PROPOSAL: 'STALE_PROPOSAL',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  COMMIT_CAPABILITY_INVALID: 'COMMIT_CAPABILITY_INVALID',
  UNDO_UNAVAILABLE: 'UNDO_UNAVAILABLE',
} as const

export const ERROR_CODES: Readonly<typeof ERROR_CODE_VALUES> = Object.freeze(
  ERROR_CODE_VALUES,
)

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

export interface RecoverableError<Code extends ErrorCode = ErrorCode> {
  readonly code: Code
  readonly message: string
  readonly nextActions: readonly string[]
}

export interface SuccessOutcome<Data> {
  readonly ok: true
  readonly data: Data
}

export interface RecoverableErrorOutcome<Code extends ErrorCode = ErrorCode> {
  readonly ok: false
  readonly error: RecoverableError<Code>
}

export type Outcome<
  Data,
  Code extends ErrorCode = ErrorCode,
> = SuccessOutcome<Data> | RecoverableErrorOutcome<Code>

export type RecoverableOutcome<
  Data,
  Code extends ErrorCode = ErrorCode,
> = Outcome<Data, Code>

export const success = <Data,>(data: Data): SuccessOutcome<Data> => ({
  ok: true,
  data,
})

export const failure = <Code extends ErrorCode>(
  code: Code,
  message: string,
  nextActions: readonly string[] = [],
): RecoverableErrorOutcome<Code> => ({
  ok: false,
  error: {
    code,
    message,
    nextActions,
  },
})
