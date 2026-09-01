import type {
  ArchivedSession,
  CommitRecord,
  JournalEntry,
  LoadPolicy,
  Proposal,
} from './store'

/** The only persisted format currently understood by WattKeep. */
export const PERSISTENCE_SCHEMA_VERSION = 1 as const

/** A namespaced key keeps WattKeep's local state separate from other pages. */
export const PERSISTENCE_KEY = 'wattkeep:state:v1'

// These aliases make the storage boundary easy to discover for adapters and tests.
export const STORAGE_KEY = PERSISTENCE_KEY
export const SCHEMA_VERSION = PERSISTENCE_SCHEMA_VERSION

export type PersistenceMode = 'persistent' | 'memory-only'

export type PersistenceIssue =
  | 'unavailable'
  | 'read-failed'
  | 'corrupt'
  | 'unknown-version'
  | 'write-failed'
  | 'clear-failed'

/** The smallest Storage shape needed by the store, also suitable for test fakes. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PersistedStoreState {
  readonly sessionEpoch: number
  readonly workspaceRevision: number
  readonly forecastKind: 'canonical' | 'alternate'
  readonly committedPolicy: LoadPolicy
  readonly activeProposal: Proposal | null
  readonly journal: readonly JournalEntry[]
  readonly archivedSessions: readonly ArchivedSession[]
  readonly lastCommit: CommitRecord | null
}

export interface PersistenceEnvelope {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION
  readonly snapshot: PersistedStoreState
}

export interface PersistenceReadResult {
  readonly storage: StorageLike | null
  readonly state: PersistedStoreState | null
  readonly issue: PersistenceIssue | null
}

export interface PersistenceWriteResult {
  readonly ok: boolean
  readonly issue: PersistenceIssue | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

/**
 * Resolve browser localStorage without making SSR or privacy-mode failures fatal.
 * Passing null explicitly disables persistence for a store instance.
 */
export const resolveStorage = (
  candidate?: StorageLike | null,
): StorageLike | null => {
  if (candidate !== undefined) {
    return candidate
  }

  try {
    if (typeof globalThis === 'undefined' || globalThis.localStorage === undefined) {
      return null
    }

    return globalThis.localStorage
  } catch {
    return null
  }
}

const classifyEnvelope = (
  value: unknown,
): { state: PersistedStoreState | null; issue: PersistenceIssue | null } => {
  if (!isRecord(value)) {
    return { state: null, issue: 'corrupt' }
  }

  if (typeof value.schemaVersion !== 'number') {
    return { state: null, issue: 'corrupt' }
  }

  if (value.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) {
    return { state: null, issue: 'unknown-version' }
  }

  if (!isRecord(value.snapshot)) {
    return { state: null, issue: 'corrupt' }
  }

  return {
    state: value.snapshot as unknown as PersistedStoreState,
    issue: null,
  }
}

export const readPersistedState = (
  candidate?: StorageLike | null,
  key: string = PERSISTENCE_KEY,
): PersistenceReadResult => {
  const storage = resolveStorage(candidate)
  if (storage === null) {
    return { storage: null, state: null, issue: 'unavailable' }
  }

  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { storage, state: null, issue: 'read-failed' }
  }

  if (raw === null) {
    return { storage, state: null, issue: null }
  }

  try {
    return { storage, ...classifyEnvelope(JSON.parse(raw) as unknown) }
  } catch {
    return { storage, state: null, issue: 'corrupt' }
  }
}

export const encodePersistedState = (
  state: PersistedStoreState,
): string => JSON.stringify({
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  snapshot: state,
} satisfies PersistenceEnvelope)

export const writePersistedState = (
  candidate: StorageLike | null,
  state: PersistedStoreState,
  key: string = PERSISTENCE_KEY,
): PersistenceWriteResult => {
  if (candidate === null) {
    return { ok: false, issue: 'unavailable' }
  }

  try {
    candidate.setItem(key, encodePersistedState(state))
    return { ok: true, issue: null }
  } catch {
    return { ok: false, issue: 'write-failed' }
  }
}

export const clearPersistedState = (
  candidate: StorageLike | null,
  key: string = PERSISTENCE_KEY,
): PersistenceWriteResult => {
  if (candidate === null) {
    return { ok: false, issue: 'unavailable' }
  }

  try {
    candidate.removeItem(key)
    return { ok: true, issue: null }
  } catch {
    return { ok: false, issue: 'clear-failed' }
  }
}

// Intention-revealing aliases for callers that prefer load/save terminology.
export const loadPersistedState = readPersistedState
export const savePersistedState = writePersistedState
