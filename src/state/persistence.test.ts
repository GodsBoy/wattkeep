import { describe, expect, it } from 'vitest'

import {
  PERSISTENCE_KEY,
  clearPersistedState,
  encodePersistedState,
  readPersistedState,
  writePersistedState,
  type PersistedStoreState,
  type StorageLike,
} from './persistence'

const state: PersistedStoreState = {
  sessionEpoch: 1,
  workspaceRevision: 1,
  forecastKind: 'canonical',
  committedPolicy: {
    planId: 'essential-reserve',
    planName: 'Essential Reserve',
    description: 'Protects essentials.',
    loadIds: ['fridge', 'wifi', 'security', 'medical-cooler'],
  },
  activeProposal: null,
  journal: [],
  archivedSessions: [],
  lastCommit: null,
}

const storage = (initial: string | null = null): StorageLike & {
  value: string | null
} => {
  let value = initial
  return {
    get value() {
      return value
    },
    getItem: () => value,
    setItem: (_key, next) => {
      value = next
    },
    removeItem: () => {
      value = null
    },
  }
}

describe('versioned WattKeep persistence boundary', () => {
  it('writes one namespaced schema-v1 envelope and reads it back', () => {
    const adapter = storage()
    const written = writePersistedState(adapter, state)
    expect(written).toEqual({ ok: true, issue: null })
    expect(adapter.value).toContain(`"schemaVersion":1`)

    const loaded = readPersistedState(adapter)
    expect(loaded.issue).toBeNull()
    expect(loaded.state).toEqual(state)
    expect(encodePersistedState(state)).toBe(adapter.value)
    expect(PERSISTENCE_KEY).toMatch(/^wattkeep:/)
  })

  it('classifies unavailable, corrupt, and unknown-version data without throwing', () => {
    expect(readPersistedState(null).issue).toBe('unavailable')
    expect(readPersistedState(storage('{bad-json')).issue).toBe('corrupt')
    expect(readPersistedState(storage(JSON.stringify({
      schemaVersion: 2,
      snapshot: state,
    }))).issue).toBe('unknown-version')
    expect(readPersistedState(storage(JSON.stringify({
      schemaVersion: 1,
    }))).issue).toBe('corrupt')
    expect(readPersistedState(storage(JSON.stringify({
      version: 1,
      state,
    }))).issue).toBe('corrupt')
  })

  it('returns recoverable results for read, write, and clear failures', () => {
    const readFailure: StorageLike = {
      getItem: () => {
        throw new Error('read denied')
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    expect(readPersistedState(readFailure).issue).toBe('read-failed')

    const writeFailure: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    }
    expect(writePersistedState(writeFailure, state)).toEqual({
      ok: false,
      issue: 'write-failed',
    })

    const clearFailure: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('clear denied')
      },
    }
    expect(clearPersistedState(clearFailure)).toEqual({
      ok: false,
      issue: 'clear-failed',
    })
  })
})
