import { describe, expect, it } from 'vitest'

import { getScenario } from './scenario'
import {
  comparePlans,
  explainInterval,
  simulatePlan,
  type SimulationResult,
} from './simulation'
import type { Outcome } from './outcomes'
import type { ReadonlyScenario } from './types'

const expectSuccess = <T,>(outcome: Outcome<T>): T => {
  if (!outcome.ok) {
    throw new Error(`${outcome.error.code}: ${outcome.error.message}`)
  }

  return outcome.data
}

const simulate = async (
  planId: string,
  signal?: AbortSignal,
): Promise<SimulationResult> => expectSuccess(
  await simulatePlan(getScenario(), planId, signal),
)

describe('pure WattKeep simulation', () => {
  it('projects each canonical plan with deterministic reserve and coverage values', async () => {
    const essential = await simulate('essential-reserve')
    const balanced = await simulate('balanced-night')
    const comfort = await simulate('comfort-carry')

    expect(essential.endEnergyKWh).toBeCloseTo(8.09, 10)
    expect(essential.coverage).toBe(100)
    expect(essential.feasible).toBe(true)
    expect(essential.firstBreachIndex).toBeNull()

    expect(balanced.endEnergyKWh).toBeCloseTo(6.97, 10)
    expect(balanced.coverage).toBe(100)
    expect(balanced.feasible).toBe(true)
    expect(balanced.firstBreachIndex).toBeNull()

    expect(comfort.endEnergyKWh).toBeCloseTo(0.67, 10)
    expect(comfort.coverage).toBe(66.7)
    expect(comfort.feasible).toBe(false)
    expect(comfort.firstBreachIndex).toBe(8)
    expect(comfort.intervals[8].label).toBe('02:00 to 03:00')
    expect(comfort.intervals[8].closingEnergyKWh).toBeCloseTo(2.605, 10)
  })

  it('is repeatable and does not mutate a caller-owned scenario', async () => {
    const scenario = getScenario()
    const before = structuredClone(scenario)

    const first = expectSuccess(await simulatePlan(scenario, 'balanced-night'))
    const second = expectSuccess(await simulatePlan(scenario, 'balanced-night'))

    expect(second).toEqual(first)
    expect(scenario).toEqual(before)
  })

  it('ranks any valid two- or three-plan set by safety, coverage, charge, then preset order', async () => {
    const scenario = getScenario()
    const all = expectSuccess(await comparePlans(
      scenario,
      ['comfort-carry', 'essential-reserve', 'balanced-night'],
    ))
    const pair = expectSuccess(await comparePlans(
      scenario,
      ['comfort-carry', 'essential-reserve'],
    ))

    expect(all.ranked.map((entry) => entry.planId)).toEqual([
      'essential-reserve',
      'balanced-night',
      'comfort-carry',
    ])
    expect(pair.ranked.map((entry) => entry.planId)).toEqual([
      'essential-reserve',
      'comfort-carry',
    ])
    expect(all.ranked.every((entry) => entry.tradeOffReason.length > 0)).toBe(true)
    expect(all.ranked[0].tradeOffReason).toMatch(/reserve|kWh/i)
    expect(all.ranked[2].tradeOffReason).toMatch(/breach|reserve|kWh/i)

    const baseScenario = getScenario()
    const tiedScenario: ReadonlyScenario = {
      ...baseScenario,
      loads: baseScenario.loads.map((load) => ({
        ...load,
        activeIntervalsByPlan: {
          'essential-reserve': [],
          'balanced-night': [],
          'comfort-carry': [],
        },
      })),
    }
    const tied = expectSuccess(await comparePlans(
      tiedScenario,
      ['comfort-carry', 'balanced-night', 'essential-reserve'],
    ))
    expect(tied.ranked.map((entry) => entry.planId)).toEqual([
      'essential-reserve',
      'balanced-night',
      'comfort-carry',
    ])
  })

  it('returns recoverable validation outcomes', async () => {
    const scenario = getScenario()

    const unknown = await simulatePlan(scenario, 'not-a-plan')
    const duplicate = await comparePlans(
      scenario,
      ['essential-reserve', 'essential-reserve'],
    )
    const tooSmall = await comparePlans(scenario, ['essential-reserve'])
    const tooLarge = await comparePlans(scenario, [
      'essential-reserve',
      'balanced-night',
      'comfort-carry',
      'not-a-plan',
    ])
    const invalidInterval = await explainInterval(
      await simulate('essential-reserve'),
      12,
    )

    expect(unknown).toMatchObject({ ok: false, error: { code: 'UNKNOWN_PLAN' } })
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'DUPLICATE_PLAN' } })
    expect(tooSmall).toMatchObject({ ok: false, error: { code: 'INVALID_PLAN_COUNT' } })
    expect(tooLarge).toMatchObject({ ok: false, error: { code: 'INVALID_PLAN_COUNT' } })
    expect(invalidInterval).toMatchObject({ ok: false, error: { code: 'INVALID_INTERVAL' } })
  })

  it('honours cancellation before work and at the explicit yield boundary', async () => {
    const scenario = getScenario()
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()

    const before = await simulatePlan(
      scenario,
      'essential-reserve',
      alreadyAborted.signal,
    )

    const atYield = new AbortController()
    queueMicrotask(() => atYield.abort())
    const during = await simulatePlan(
      scenario,
      'essential-reserve',
      atYield.signal,
    )

    expect(before).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
    expect(during).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  })

  it('explains first, breach, and final intervals from the simulation accounting', async () => {
    const result = await simulate('comfort-carry')

    const first = expectSuccess(await explainInterval(result, 0))
    const breach = expectSuccess(await explainInterval(result, 8))
    const final = expectSuccess(await explainInterval(result, 11))

    expect(first).toMatchObject({
      index: 0,
      solarKWh: result.intervals[0].solarKWh,
      loadKWh: result.intervals[0].loadKWh,
      energyDeltaKWh: result.intervals[0].energyDeltaKWh,
      closingEnergyKWh: result.intervals[0].closingEnergyKWh,
      reserveBreached: false,
    })
    expect(first.accessibleExplanation).toMatch(/18:00 to 19:00|first interval/i)

    expect(breach).toMatchObject({
      index: 8,
      closingEnergyKWh: result.intervals[8].closingEnergyKWh,
      reserveBreached: true,
    })
    expect(breach.accessibleExplanation).toMatch(/reserve|breach/i)

    expect(final).toMatchObject({
      index: 11,
      closingEnergyKWh: result.intervals[11].closingEnergyKWh,
    })
    expect(final.accessibleExplanation).toMatch(/05:00 to 06:00|final interval/i)
  })
})
