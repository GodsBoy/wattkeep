import { describe, expect, it } from 'vitest'

import { ERROR_CODES, type Outcome } from '../domain/outcomes'
import {
  createStore,
  type CommitCapability,
  type StoreSnapshot,
} from './store'
import type { StorageLike } from './persistence'

const expectSuccess = <Data,>(outcome: Outcome<Data>): Data => {
  if (!outcome.ok) {
    throw new Error(`${outcome.error.code}: ${outcome.error.message}`)
  }
  return outcome.data
}

const expectFailure = <Data,>(
  outcome: Outcome<Data>,
  code: string,
): void => {
  expect(outcome).toMatchObject({ ok: false, error: { code } })
}

const memoryStorage = (initial: string | null = null): StorageLike & {
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

const stageAndReview = async (store: ReturnType<typeof createStore>): Promise<StoreSnapshot> => {
  const simulation = expectSuccess(await store.agent.simulatePlan('balanced-night'))
  expectSuccess(store.agent.stagePlan(simulation.simulationId))
  expectSuccess(store.agent.requestReview(store.getSnapshot().activeProposal?.proposalId ?? ''))
  return store.getSnapshot()
}

describe('WattKeep observable store', () => {
  it('publishes a frozen baseline and keeps query work out of committed state', async () => {
    const store = createStore({ storage: null })
    const baseline = store.getSnapshot()
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    expect(Object.isFrozen(baseline)).toBe(true)
    expect(baseline.sessionEpoch).toBe(1)
    expect(baseline.workspaceRevision).toBe(1)
    expect(baseline.forecastKind).toBe('canonical')
    expect(baseline.committedPolicy.planId).toBe('essential-reserve')
    expect(baseline.activeProposal).toBeNull()
    expect(baseline.persistenceMode).toBe('memory-only')

    const simulation = expectSuccess(await store.agent.simulatePlan('balanced-night'))
    const after = store.getSnapshot()
    expect(simulation.feasible).toBe(true)
    expect(after.workspaceRevision).toBe(1)
    expect(after.committedPolicy).toEqual(baseline.committedPolicy)
    expect(after.activeProposal).toBeNull()
    expect(after.journal).toEqual([])
    expect(after.simulations).toHaveLength(1)
    expect(notifications).toBe(1)

    expectSuccess(await store.agent.comparePlans(['essential-reserve', 'balanced-night']))
    expect(notifications).toBe(2)
    expectSuccess(await store.agent.comparePlans(['essential-reserve', 'balanced-night']))
    expect(notifications).toBe(2)

    unsubscribe()
  })

  it('stages, reviews, commits through a human capability, then undoes once', async () => {
    const store = createStore({ storage: null })
    const reviewed = await stageAndReview(store)
    const proposal = reviewed.activeProposal
    if (proposal === null) {
      throw new Error('Expected a reviewed proposal')
    }

    expect(proposal.status).toBe('review-requested')
    expect(reviewed.workspaceRevision).toBe(1)
    expect(reviewed.journal.map((entry) => entry.event)).toEqual([
      'proposal-staged',
      'review-requested',
    ])

    const capability = expectSuccess(store.human.createCommitCapability(proposal.proposalId))
    const committed = expectSuccess(store.human.commit(capability))
    expect(committed.revision).toBe(2)
    expect(store.getSnapshot().committedPolicy.planId).toBe('balanced-night')
    expect(store.getSnapshot().activeProposal).toBeNull()
    expect(store.getSnapshot().undoAvailable).toBe(true)
    expect(store.getSnapshot().journal.at(-1)?.event).toBe('commit')
    expect(store.getSnapshot().journal.at(-1)?.workspaceRevision).toBe(2)

    const replay = store.human.commit(capability)
    expectFailure(replay, ERROR_CODES.COMMIT_CAPABILITY_INVALID)

    const undone = expectSuccess(store.human.undo())
    expect(undone.revision).toBe(3)
    expect(store.getSnapshot().committedPolicy.planId).toBe('essential-reserve')
    expect(store.getSnapshot().forecastKind).toBe('canonical')
    expect(store.getSnapshot().journal.at(-1)?.event).toBe('undo')
    expectFailure(store.human.undo(), ERROR_CODES.UNDO_UNAVAILABLE)
  })

  it('makes identical stage, review, and discard operations idempotent', async () => {
    const store = createStore({ storage: null })
    const simulation = expectSuccess(await store.agent.simulatePlan('balanced-night'))
    const firstStage = expectSuccess(store.agent.stagePlan(simulation.simulationId))
    const journalLengthAfterStage = store.getSnapshot().journal.length
    const secondStage = expectSuccess(store.agent.stagePlan(simulation.simulationId))
    expect(secondStage).toBe(firstStage)
    expect(store.getSnapshot().journal).toHaveLength(journalLengthAfterStage)

    const firstReview = expectSuccess(store.agent.requestReview(firstStage.proposalId))
    const journalLengthAfterReview = store.getSnapshot().journal.length
    const secondReview = expectSuccess(store.agent.requestReview(firstStage.proposalId))
    expect(secondReview.proposal).toBe(firstReview.proposal)
    expect(store.getSnapshot().journal).toHaveLength(journalLengthAfterReview)

    expectSuccess(store.agent.discardPlan(firstStage.proposalId))
    const journalLengthAfterDiscard = store.getSnapshot().journal.length
    const repeated = expectSuccess(store.agent.discardPlan(firstStage.proposalId))
    expect(repeated.alreadyDiscarded).toBe(true)
    expect(store.getSnapshot().journal).toHaveLength(journalLengthAfterDiscard)
    expect(store.getSnapshot().committedPolicy.planId).toBe('essential-reserve')
  })

  it('rejects infeasible and active conflicting stages, while replacing an exact stale proposal', async () => {
    const store = createStore({ storage: null })
    const safe = expectSuccess(await store.agent.simulatePlan('balanced-night'))
    const otherSafe = expectSuccess(await store.agent.simulatePlan('essential-reserve'))
    const unsafe = expectSuccess(await store.agent.simulatePlan('comfort-carry'))
    expectFailure(store.agent.stagePlan({
      simulationId: safe.simulationId,
      fingerprint: 'forged',
    }), ERROR_CODES.PROPOSAL_MISMATCH)
    const staged = expectSuccess(store.agent.stagePlan(safe.simulationId))

    expectFailure(store.agent.stagePlan(unsafe.simulationId), ERROR_CODES.ACTIVE_PROPOSAL)
    expectFailure(store.agent.stagePlan(otherSafe.simulationId, 'not-the-active-id'), ERROR_CODES.PROPOSAL_MISMATCH)
    expectFailure(store.agent.stagePlan(otherSafe.simulationId), ERROR_CODES.ACTIVE_PROPOSAL)
    expect(store.getSnapshot().activeProposal?.proposalId).toBe(staged.proposalId)

    expectSuccess(store.human.refreshForecast())
    expect(store.getSnapshot().activeProposal?.status).toBe('stale')
    const fresh = expectSuccess(await store.agent.simulatePlan('balanced-night'))
    const replacement = expectSuccess(store.agent.stagePlan({
      simulationId: fresh.simulationId,
      replaceProposalId: staged.proposalId,
    }))
    expect(replacement.proposalId).not.toBe(staged.proposalId)
    expect(replacement.status).toBe('staged')
    expect(store.getSnapshot().workspaceRevision).toBe(2)
    expectFailure(store.agent.stagePlan(unsafe.simulationId), ERROR_CODES.STALE_SIMULATION)
  })

  it('marks a proposal stale on forecast refresh and audits a stale capability rejection', async () => {
    const store = createStore({ storage: null })
    const reviewed = await stageAndReview(store)
    const proposalId = reviewed.activeProposal?.proposalId
    if (proposalId === undefined) {
      throw new Error('Expected a proposal ID')
    }
    const capability = expectSuccess(store.human.createCommitCapability(proposalId))

    const refreshed = expectSuccess(store.human.refreshForecast())
    expect(refreshed.forecastKind).toBe('alternate')
    expect(refreshed.revision).toBe(2)
    expect(store.getSnapshot().activeProposal?.status).toBe('stale')
    const stale = store.human.commit(capability)
    expectFailure(stale, ERROR_CODES.STALE_PROPOSAL)
    expect(store.getSnapshot().committedPolicy.planId).toBe('essential-reserve')
    expect(store.getSnapshot().journal.at(-1)?.event).toBe('stale-rejection')

    const journalLength = store.getSnapshot().journal.length
    const repeatRefresh = expectSuccess(store.human.refreshForecast())
    expect(repeatRefresh.alreadyRefreshed).toBe(true)
    expect(store.getSnapshot().journal).toHaveLength(journalLength)
  })

  it('keeps repeated review of a stale proposal side-effect free', async () => {
    const store = createStore({ storage: null })
    const reviewed = await stageAndReview(store)
    const proposalId = reviewed.activeProposal?.proposalId
    if (proposalId === undefined) {
      throw new Error('Expected a proposal ID')
    }

    expectSuccess(store.human.refreshForecast())
    const journalLength = store.getSnapshot().journal.length
    expectFailure(store.agent.requestReview(proposalId), ERROR_CODES.STALE_PROPOSAL)
    expectFailure(store.agent.requestReview(proposalId), ERROR_CODES.STALE_PROPOSAL)
    expect(store.getSnapshot().journal).toHaveLength(journalLength)
  })

  it('allows only one of two capabilities bound to the same proposal to commit', async () => {
    const store = createStore({ storage: null })
    const reviewed = await stageAndReview(store)
    const proposalId = reviewed.activeProposal?.proposalId
    if (proposalId === undefined) {
      throw new Error('Expected a proposal ID')
    }
    const first = expectSuccess(store.human.createCommitCapability(proposalId))
    const second = expectSuccess(store.human.createCommitCapability(proposalId))

    expectSuccess(store.human.commit(first))
    const loser = store.human.commit(second)
    expectFailure(loser, ERROR_CODES.STALE_PROPOSAL)
    expect(store.getSnapshot().committedPolicy.planId).toBe('balanced-night')
    expect(store.getSnapshot().journal.filter((entry) => entry.event === 'commit')).toHaveLength(1)
  })

  it('does not permit a forged capability or committing before review', async () => {
    const store = createStore({ storage: null })
    const simulation = expectSuccess(await store.agent.simulatePlan('balanced-night'))
    const proposal = expectSuccess(store.agent.stagePlan(simulation.simulationId))

    expectFailure(store.human.commit(proposal.proposalId as unknown as CommitCapability), ERROR_CODES.REVIEW_REQUIRED)
    expectFailure(store.human.commit({
      sessionEpoch: 1,
      epoch: 1,
      proposalId: proposal.proposalId,
      baseRevision: 1,
      status: 'review-requested',
    } as CommitCapability), ERROR_CODES.COMMIT_CAPABILITY_INVALID)
  })

  it('cancels delayed old-epoch work without populating the new session cache', async () => {
    const store = createStore({ storage: null })
    const pending = store.agent.simulatePlan('balanced-night')
    const oldEpoch = store.getSnapshot().sessionEpoch
    const reset = expectSuccess(store.human.reset())
    expect(store.getSnapshot().sessionEpoch).toBe(oldEpoch + 1)
    expect(reset.archivedSessionEpoch).toBe(oldEpoch)
    expect(store.getSnapshot().workspaceRevision).toBe(1)
    expect(store.getSnapshot().journal.at(-1)?.event).toBe('session-reset')
    expect(store.getSnapshot().archivedSessions.at(-1)?.sessionEpoch).toBe(oldEpoch)

    const delayed = await pending
    expectFailure(delayed, ERROR_CODES.SESSION_MISMATCH)
    expect(store.getSnapshot().simulations).toEqual([])
    expectFailure(
      await store.agent.explainInterval('simulation:wattkeep-seed:1:balanced-night:missing', 0),
      ERROR_CODES.UNKNOWN_SIMULATION,
    )
  })

  it('hydrates a durable snapshot before returning and recovers safely from bad storage', async () => {
    const storage = memoryStorage()
    const first = createStore({ storage })
    const simulation = expectSuccess(await first.agent.simulatePlan('balanced-night'))
    const proposal = expectSuccess(first.agent.stagePlan(simulation.simulationId))
    expectSuccess(first.agent.requestReview(proposal.proposalId))
    expect(first.getSnapshot().persistenceMode).toBe('persistent')

    const reloaded = createStore({ storage })
    expect(reloaded.getSnapshot().activeProposal?.proposalId).toBe(proposal.proposalId)
    expect(reloaded.getSnapshot().activeProposal?.status).toBe('review-requested')
    expect(reloaded.getSnapshot().simulations).toEqual([])

    const capability = expectSuccess(reloaded.human.createCommitCapability(proposal.proposalId))
    expectSuccess(reloaded.human.commit(capability))
    const committedReload = createStore({ storage })
    expect(committedReload.getSnapshot().committedPolicy.planId).toBe('balanced-night')
    expect(committedReload.getSnapshot().undoAvailable).toBe(true)
    expectSuccess(committedReload.human.undo())
    expect(committedReload.getSnapshot().committedPolicy.planId).toBe('essential-reserve')

    const corrupt = memoryStorage('{not-json')
    const degraded = createStore({ storage: corrupt })
    expect(degraded.getSnapshot().persistenceMode).toBe('memory-only')
    expect(degraded.getSnapshot().persistenceIssue).toBe('corrupt')

    const unknown = memoryStorage(JSON.stringify({ schemaVersion: 99, snapshot: {} }))
    const unknownVersion = createStore({ storage: unknown })
    expect(unknownVersion.getSnapshot().persistenceMode).toBe('memory-only')
    expect(unknownVersion.getSnapshot().persistenceIssue).toBe('unknown-version')

    const malformed = JSON.parse(storage.value ?? '{}') as {
      snapshot: { journal: unknown[] }
    }
    malformed.snapshot.journal = [{ event: 'commit' }]
    const malformedNestedState = createStore({
      storage: memoryStorage(JSON.stringify(malformed)),
    })
    expect(malformedNestedState.getSnapshot().persistenceMode).toBe('memory-only')
    expect(malformedNestedState.getSnapshot().persistenceIssue).toBe('corrupt')
    expect(malformedNestedState.getSnapshot().committedPolicy.planId).toBe('essential-reserve')
  })

  it('returns recoverable outcomes for malformed runtime inputs instead of throwing', async () => {
    const store = createStore({ storage: null })

    expectFailure(await store.agent.simulatePlan(null as unknown as string), ERROR_CODES.UNKNOWN_PLAN)
    expectFailure(await store.agent.comparePlans(null as unknown as string[]), ERROR_CODES.INVALID_PLAN_COUNT)
    expectFailure(await store.agent.comparePlans([null, 'balanced-night'] as unknown as string[]), ERROR_CODES.UNKNOWN_PLAN)
    expectFailure(
      await store.agent.explainInterval(null as unknown as string, 0),
      ERROR_CODES.UNKNOWN_SIMULATION,
    )
    expectFailure(store.agent.stagePlan(null as unknown as string), ERROR_CODES.UNKNOWN_SIMULATION)
    expectFailure(store.agent.requestReview(null as unknown as string), ERROR_CODES.NO_PROPOSAL)
    expectFailure(store.agent.discardPlan(null as unknown as string), ERROR_CODES.PROPOSAL_MISMATCH)
    expectFailure(store.human.createCommitCapability(null as unknown as string), ERROR_CODES.NO_PROPOSAL)
    expectFailure(
      store.human.commit({ invalid: true } as unknown as CommitCapability),
      ERROR_CODES.COMMIT_CAPABILITY_INVALID,
    )
  })

  it('keeps a safe in-memory transition when persistence writes or reset clearing fail', async () => {
    const writeFailure: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    }
    const degraded = createStore({ storage: writeFailure })
    const simulation = expectSuccess(await degraded.agent.simulatePlan('balanced-night'))
    const proposal = expectSuccess(degraded.agent.stagePlan(simulation.simulationId))
    expect(degraded.getSnapshot().activeProposal?.proposalId).toBe(proposal.proposalId)
    expect(degraded.getSnapshot().persistenceMode).toBe('memory-only')
    expect(degraded.getSnapshot().persistenceIssue).toBe('write-failed')

    const clearFailure: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('clear denied')
      },
    }
    const reset = createStore({ storage: clearFailure })
    expectSuccess(reset.human.reset())
    expect(reset.getSnapshot().sessionEpoch).toBe(2)
    expect(reset.getSnapshot().workspaceRevision).toBe(1)
    expect(reset.getSnapshot().persistenceMode).toBe('memory-only')
    expect(reset.getSnapshot().persistenceIssue).toBe('clear-failed')
  })
})
