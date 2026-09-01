import {
  ERROR_CODES,
  failure,
  success,
  type Outcome,
} from './outcomes'
import { PLAN_IDS_IN_ORDER } from './scenario'
import type {
  LoadId,
  PlanId,
  PlanPreset,
  ReadonlyScenario,
} from './types'

export interface SimulatedLoad {
  readonly loadId: LoadId
  readonly name: string
  readonly drawKW: number
  readonly energyKWh: number
}

export interface IntervalProjection {
  readonly index: number
  readonly start: string
  readonly end: string
  readonly label: string
  readonly solarKWh: number
  readonly activeLoads: readonly SimulatedLoad[]
  readonly loadKWh: number
  readonly energyDeltaKWh: number
  readonly openingEnergyKWh: number
  readonly closingEnergyKWh: number
  readonly reserveKWh: number
  readonly reserveBreached: boolean
}

export type SimulationInterval = IntervalProjection

export interface SimulationResult {
  readonly simulationId: string
  readonly fingerprint: string
  readonly scenarioId: string
  readonly revision: number
  readonly planId: PlanId
  readonly planName: string
  readonly intervals: readonly IntervalProjection[]
  readonly startEnergyKWh: number
  readonly endEnergyKWh: number
  readonly endChargePercent: number
  readonly capacityKWh: number
  readonly reserveKWh: number
  readonly totalSolarKWh: number
  readonly totalLoadKWh: number
  readonly feasible: boolean
  readonly firstBreachIndex: number | null
  readonly coverage: number
  readonly coveragePercent: number
}

export interface RankedPlan {
  readonly rank: number
  readonly planId: PlanId
  readonly planName: string
  readonly simulation: SimulationResult
  readonly tradeOffReason: string
}

export interface PlanComparison {
  readonly requestedPlanIds: readonly PlanId[]
  readonly ranked: readonly RankedPlan[]
}

export interface IntervalExplanation {
  readonly index: number
  readonly start: string
  readonly end: string
  readonly label: string
  readonly solarKWh: number
  readonly activeLoads: readonly SimulatedLoad[]
  readonly loadKWh: number
  readonly energyDeltaKWh: number
  readonly openingEnergyKWh: number
  readonly closingEnergyKWh: number
  readonly reserveKWh: number
  readonly reserveBreached: boolean
  readonly explanation: string
  readonly accessibleExplanation: string
}

const CANCELLED_MESSAGE = 'The operation was cancelled before a result was ready.'

const nextActions = Object.freeze({
  retry: Object.freeze(['Retry the operation.']),
  choosePlan: Object.freeze(['Choose a plan ID from the scenario.']),
  chooseComparison: Object.freeze(['Choose two or three different plan IDs.']),
  chooseInterval: Object.freeze(['Choose an interval from 0 through 11.']),
})

const cancelled = <Data,>(): Outcome<Data> => failure(
  ERROR_CODES.CANCELLED,
  CANCELLED_MESSAGE,
  nextActions.retry,
)

const yieldOnce = async (): Promise<void> => {
  await Promise.resolve()
}

const canonicalise = (value: unknown): string => {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'undefined') {
    return 'undefined'
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalise(item)).join(',')}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))

    return `{${entries.map(([key, nested]) => (
      `${JSON.stringify(key)}:${canonicalise(nested)}`
    )).join(',')}}`
  }

  return JSON.stringify(String(value))
}

const hash = (value: string): string => {
  let result = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }

  return (result >>> 0).toString(16).padStart(8, '0')
}

const getFingerprint = (
  scenario: ReadonlyScenario,
  planId: PlanId,
): string => hash(canonicalise({
  planId,
  scenario,
}))

const getSimulationId = (
  scenario: ReadonlyScenario,
  planId: PlanId,
  fingerprint: string,
): string => [
  'simulation',
  scenario.id,
  scenario.revision,
  planId,
  fingerprint,
].join(':')

const getPlan = (
  scenario: ReadonlyScenario,
  runtimePlanId: string,
): PlanPreset | undefined => scenario.plans.find((plan) => plan.id === runtimePlanId)

const unknownPlan = (runtimePlanId: string): Outcome<never> => failure(
  ERROR_CODES.UNKNOWN_PLAN,
  runtimePlanId.length === 0
    ? 'Choose a plan before running a simulation.'
    : 'The requested plan is not available in this scenario.',
  nextActions.choosePlan,
)

const invalidPlanCount = (): Outcome<never> => failure(
  ERROR_CODES.INVALID_PLAN_COUNT,
  'Choose between two and three plans to compare.',
  nextActions.chooseComparison,
)

const duplicatePlan = (): Outcome<never> => failure(
  ERROR_CODES.DUPLICATE_PLAN,
  'Each plan may appear only once in a comparison.',
  nextActions.chooseComparison,
)

const invalidInterval = (intervalCount: number): Outcome<never> => failure(
  ERROR_CODES.INVALID_INTERVAL,
  `The interval index must be a whole number from 0 through ${Math.max(0, intervalCount - 1)}.`,
  nextActions.chooseInterval,
)

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10

const freezeProjection = (projection: IntervalProjection): IntervalProjection => Object.freeze({
  ...projection,
  activeLoads: Object.freeze([...projection.activeLoads]),
})

const calculateSimulation = (
  scenario: ReadonlyScenario,
  plan: PlanPreset,
): SimulationResult => {
  const capacityKWh = scenario.battery.capacityKWh
  const reserveKWh = scenario.battery.reserveKWh
  const intervalHours = scenario.outage.intervalHours
  let previousEnergyKWh = scenario.battery.startEnergyKWh

  const intervals = scenario.intervals.map((scenarioInterval, position) => {
    const activeLoads = scenario.loads
      .filter((load) => (
        plan.loadIds.includes(load.id)
        && load.activeIntervalsByPlan[plan.id].includes(scenarioInterval.index)
      ))
      .map((load) => ({
        loadId: load.id,
        name: load.name,
        drawKW: load.drawKW,
        energyKWh: load.drawKW * intervalHours,
      }))
      .map((load) => Object.freeze(load))
    const solarKWh = scenario.solarKWh[position] ?? 0
    const loadKWh = activeLoads.reduce(
      (total, load) => total + load.energyKWh,
      0,
    )
    const energyDeltaKWh = solarKWh - loadKWh
    const openingEnergyKWh = previousEnergyKWh
    const closingEnergyKWh = Math.min(
      capacityKWh,
      Math.max(0, openingEnergyKWh + energyDeltaKWh),
    )

    previousEnergyKWh = closingEnergyKWh

    return freezeProjection({
      index: scenarioInterval.index,
      start: scenarioInterval.start,
      end: scenarioInterval.end,
      label: scenarioInterval.label,
      solarKWh,
      activeLoads,
      loadKWh,
      energyDeltaKWh,
      openingEnergyKWh,
      closingEnergyKWh,
      reserveKWh,
      reserveBreached: closingEnergyKWh < reserveKWh,
    })
  })

  const breach = intervals.find((interval) => interval.reserveBreached)
  const coverageCount = intervals.filter(
    (interval) => interval.closingEnergyKWh >= reserveKWh,
  ).length
  const coverage = intervals.length === 0
    ? 0
    : roundToOneDecimal((coverageCount / intervals.length) * 100)
  const totalSolarKWh = intervals.reduce(
    (total, interval) => total + interval.solarKWh,
    0,
  )
  const totalLoadKWh = intervals.reduce(
    (total, interval) => total + interval.loadKWh,
    0,
  )
  const fingerprint = getFingerprint(scenario, plan.id)

  return Object.freeze({
    simulationId: getSimulationId(scenario, plan.id, fingerprint),
    fingerprint,
    scenarioId: scenario.id,
    revision: scenario.revision,
    planId: plan.id,
    planName: plan.name,
    intervals: Object.freeze(intervals),
    startEnergyKWh: scenario.battery.startEnergyKWh,
    endEnergyKWh: previousEnergyKWh,
    endChargePercent: (previousEnergyKWh / capacityKWh) * 100,
    capacityKWh,
    reserveKWh,
    totalSolarKWh,
    totalLoadKWh,
    feasible: breach === undefined,
    firstBreachIndex: breach?.index ?? null,
    coverage,
    coveragePercent: coverage,
  })
}

const ordinal = (rank: number): string => {
  if (rank === 1) return 'first'
  if (rank === 2) return 'second'
  if (rank === 3) return 'third'
  return `${rank}th`
}

const buildTradeOffReason = (
  simulation: SimulationResult,
  rank: number,
): string => {
  const charge = `${simulation.endEnergyKWh.toFixed(2)} kWh`

  if (simulation.feasible) {
    return `Ranks ${ordinal(rank)} because it stays above the ${simulation.reserveKWh.toFixed(2)} kWh reserve and finishes with ${charge}.`
  }

  const breach = simulation.intervals.find((interval) => interval.reserveBreached)
  const breachLabel = breach === undefined ? 'a later interval' : breach.label

  return `Ranks ${ordinal(rank)} because it breaches the ${simulation.reserveKWh.toFixed(2)} kWh reserve at ${breachLabel} and finishes with ${charge}.`
}

const canonicalRank = new Map<PlanId, number>(
  PLAN_IDS_IN_ORDER.map((planId, index) => [planId, index]),
)

const compareSimulationSafety = (
  left: SimulationResult,
  right: SimulationResult,
): number => {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1
  }

  if (left.coverage !== right.coverage) {
    return right.coverage - left.coverage
  }

  if (left.endEnergyKWh !== right.endEnergyKWh) {
    return right.endEnergyKWh - left.endEnergyKWh
  }

  return (canonicalRank.get(left.planId) ?? Number.MAX_SAFE_INTEGER)
    - (canonicalRank.get(right.planId) ?? Number.MAX_SAFE_INTEGER)
}

export const simulatePlan = async (
  scenario: ReadonlyScenario,
  runtimePlanId: string,
  signal?: AbortSignal,
): Promise<Outcome<SimulationResult>> => {
  if (signal?.aborted) {
    return cancelled()
  }

  const plan = getPlan(scenario, runtimePlanId)
  if (plan === undefined) {
    return unknownPlan(runtimePlanId)
  }

  await yieldOnce()

  if (signal?.aborted) {
    return cancelled()
  }

  try {
    return success(calculateSimulation(scenario, plan))
  } catch {
    return failure(
      ERROR_CODES.INTERNAL_ERROR,
      'The simulation could not be calculated from the current scenario.',
      nextActions.retry,
    )
  }
}

export const comparePlans = async (
  scenario: ReadonlyScenario,
  runtimePlanIds: readonly string[],
  signal?: AbortSignal,
): Promise<Outcome<PlanComparison>> => {
  if (signal?.aborted) {
    return cancelled()
  }

  if (!Array.isArray(runtimePlanIds) || runtimePlanIds.length < 2 || runtimePlanIds.length > 3) {
    return invalidPlanCount()
  }

  if (new Set(runtimePlanIds).size !== runtimePlanIds.length) {
    return duplicatePlan()
  }

  const plans: PlanPreset[] = []
  for (const runtimePlanId of runtimePlanIds) {
    const plan = getPlan(scenario, runtimePlanId)
    if (plan === undefined) {
      return unknownPlan(runtimePlanId)
    }
    plans.push(plan)
  }

  await yieldOnce()

  if (signal?.aborted) {
    return cancelled()
  }

  try {
    const simulations = plans
      .map((plan) => calculateSimulation(scenario, plan))
      .sort(compareSimulationSafety)
    const ranked = simulations.map((simulation, index) => {
      const rank = index + 1
      return Object.freeze({
        rank,
        planId: simulation.planId,
        planName: simulation.planName,
        simulation,
        tradeOffReason: buildTradeOffReason(simulation, rank),
      })
    })

    return success(Object.freeze({
      requestedPlanIds: Object.freeze(plans.map((plan) => plan.id)),
      ranked: Object.freeze(ranked),
    }))
  } catch {
    return failure(
      ERROR_CODES.INTERNAL_ERROR,
      'The plan comparison could not be calculated from the current scenario.',
      nextActions.retry,
    )
  }
}

const buildExplanation = (interval: IntervalProjection, isFinal: boolean): string => {
  const loadSummary = interval.activeLoads.length === 0
    ? 'no scheduled loads'
    : interval.activeLoads.map((load) => (
      `${load.name} using ${load.energyKWh.toFixed(2)} kWh`
    )).join(', ')
  const change = interval.energyDeltaKWh >= 0 ? 'increased by' : 'fell by'
  const reserveSummary = interval.reserveBreached
    ? `below the ${interval.reserveKWh.toFixed(2)} kWh reserve`
    : `above the ${interval.reserveKWh.toFixed(2)} kWh reserve`
  const position = interval.index === 0
    ? 'This is the first interval.'
    : isFinal
      ? 'This is the final interval.'
      : ''

  return `${position}${position === '' ? '' : ' '}From ${interval.start} to ${interval.end}, ${interval.solarKWh.toFixed(2)} kWh of solar was added and ${interval.loadKWh.toFixed(2)} kWh was used by ${loadSummary}. Energy ${change} by ${Math.abs(interval.energyDeltaKWh).toFixed(2)} kWh, from ${interval.openingEnergyKWh.toFixed(2)} kWh to ${interval.closingEnergyKWh.toFixed(2)} kWh, leaving the battery ${reserveSummary}.`
}

export const explainInterval = async (
  simulation: SimulationResult,
  runtimeIntervalIndex: number,
  signal?: AbortSignal,
): Promise<Outcome<IntervalExplanation>> => {
  if (signal?.aborted) {
    return cancelled()
  }

  if (!Number.isInteger(runtimeIntervalIndex)
    || runtimeIntervalIndex < 0
    || runtimeIntervalIndex >= simulation.intervals.length) {
    return invalidInterval(simulation.intervals.length)
  }

  await yieldOnce()

  if (signal?.aborted) {
    return cancelled()
  }

  try {
    const interval = simulation.intervals[runtimeIntervalIndex]
    if (interval === undefined) {
      return invalidInterval(simulation.intervals.length)
    }

    const explanation = buildExplanation(
      interval,
      runtimeIntervalIndex === simulation.intervals.length - 1,
    )

    return success(Object.freeze({
      ...interval,
      activeLoads: Object.freeze([...interval.activeLoads]),
      explanation,
      accessibleExplanation: explanation,
    }))
  } catch {
    return failure(
      ERROR_CODES.INTERNAL_ERROR,
      'The interval explanation could not be prepared.',
      nextActions.retry,
    )
  }
}
