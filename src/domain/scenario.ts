import type {
  Battery,
  DeepReadonly,
  Household,
  LoadDefinition,
  LoadId,
  Outage,
  PlanId,
  PlanPreset,
  ReadonlyScenario,
  Scenario,
  ScenarioInterval,
} from './types'

const ALL_INTERVALS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => index),
)

const EMPTY_INTERVALS = Object.freeze([] as number[])

const PLAN_IDS = Object.freeze([
  'essential-reserve',
  'balanced-night',
  'comfort-carry',
] as PlanId[])

const LOAD_IDS = Object.freeze([
  'fridge',
  'wifi',
  'security',
  'medical-cooler',
  'lighting',
  'fan',
  'entertainment',
  'workstation',
  'water-heater',
  'pool-pump',
] as LoadId[])

const CANONICAL_INTERVALS = Object.freeze([
  { index: 0, start: '18:00', end: '19:00', label: '18:00 to 19:00' },
  { index: 1, start: '19:00', end: '20:00', label: '19:00 to 20:00' },
  { index: 2, start: '20:00', end: '21:00', label: '20:00 to 21:00' },
  { index: 3, start: '21:00', end: '22:00', label: '21:00 to 22:00' },
  { index: 4, start: '22:00', end: '23:00', label: '22:00 to 23:00' },
  { index: 5, start: '23:00', end: '00:00', label: '23:00 to 00:00' },
  { index: 6, start: '00:00', end: '01:00', label: '00:00 to 01:00' },
  { index: 7, start: '01:00', end: '02:00', label: '01:00 to 02:00' },
  { index: 8, start: '02:00', end: '03:00', label: '02:00 to 03:00' },
  { index: 9, start: '03:00', end: '04:00', label: '03:00 to 04:00' },
  { index: 10, start: '04:00', end: '05:00', label: '04:00 to 05:00' },
  { index: 11, start: '05:00', end: '06:00', label: '05:00 to 06:00' },
] as ScenarioInterval[])

const CANONICAL_SOLAR_VALUES = [
  0.15, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.25,
]

const ALTERNATE_SOLAR_VALUES = [
  0.15, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1,
]

const CANONICAL_HOUSEHOLD: Household = {
  id: 'seed-household',
  name: 'The Morgan household',
}

const CANONICAL_BATTERY: Battery = {
  capacityKWh: 13.5,
  startEnergyKWh: 10.53,
  startChargePercent: 78,
  reserveKWh: 2.7,
  reservePercent: 20,
}

const CANONICAL_OUTAGE: Outage = {
  start: '18:00',
  end: '06:00',
  intervalHours: 1,
  intervalCount: 12,
}

const intervalMap = (intervals: readonly number[]) => ({
  'essential-reserve': Object.freeze([...intervals]),
  'balanced-night': Object.freeze([...intervals]),
  'comfort-carry': Object.freeze([...intervals]),
})

const noIntervals = () => ({
  'essential-reserve': EMPTY_INTERVALS,
  'balanced-night': EMPTY_INTERVALS,
  'comfort-carry': EMPTY_INTERVALS,
})

const CANONICAL_LOADS: readonly LoadDefinition[] = Object.freeze([
  {
    id: 'fridge',
    name: 'Fridge',
    drawKW: 0.12,
    activeIntervalsByPlan: intervalMap(ALL_INTERVALS),
  },
  {
    id: 'wifi',
    name: 'Wi-Fi',
    drawKW: 0.025,
    activeIntervalsByPlan: intervalMap(ALL_INTERVALS),
  },
  {
    id: 'security',
    name: 'Security',
    drawKW: 0.04,
    activeIntervalsByPlan: intervalMap(ALL_INTERVALS),
  },
  {
    id: 'medical-cooler',
    name: 'Medical cooler',
    drawKW: 0.06,
    activeIntervalsByPlan: intervalMap(ALL_INTERVALS),
  },
  {
    id: 'lighting',
    name: 'Lighting',
    drawKW: 0.08,
    activeIntervalsByPlan: {
      ...noIntervals(),
      'balanced-night': Object.freeze([0, 1, 2, 3, 4]),
      'comfort-carry': Object.freeze([0, 1, 2, 3, 4]),
    },
  },
  {
    id: 'fan',
    name: 'Fan',
    drawKW: 0.09,
    activeIntervalsByPlan: {
      ...noIntervals(),
      'balanced-night': Object.freeze([2, 3, 4, 5]),
      'comfort-carry': Object.freeze([2, 3, 4, 5]),
    },
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    drawKW: 0.12,
    activeIntervalsByPlan: {
      ...noIntervals(),
      'balanced-night': Object.freeze([1, 2, 3]),
      'comfort-carry': Object.freeze([1, 2, 3]),
    },
  },
  {
    id: 'workstation',
    name: 'Workstation',
    drawKW: 0.2,
    activeIntervalsByPlan: {
      ...noIntervals(),
      'comfort-carry': Object.freeze([0, 1, 2, 3]),
    },
  },
  {
    id: 'water-heater',
    name: 'Water heater',
    drawKW: 2,
    activeIntervalsByPlan: {
      ...noIntervals(),
      'comfort-carry': Object.freeze([2, 3]),
    },
  },
  {
    id: 'pool-pump',
    name: 'Pool pump',
    drawKW: 0.75,
    activeIntervalsByPlan: {
      ...noIntervals(),
      'comfort-carry': Object.freeze([10, 11]),
    },
  },
])

const CANONICAL_PLANS: readonly PlanPreset[] = Object.freeze([
  {
    id: 'essential-reserve',
    name: 'Essential Reserve',
    description: 'Protects only the household essentials through the outage.',
    loadIds: Object.freeze(LOAD_IDS.slice(0, 4)),
  },
  {
    id: 'balanced-night',
    name: 'Balanced Night',
    description: 'Keeps essential services on with measured evening comfort.',
    loadIds: Object.freeze(LOAD_IDS.slice(0, 7)),
  },
  {
    id: 'comfort-carry',
    name: 'Comfort Carry',
    description: 'Adds heavier comfort loads while accepting a reserve breach.',
    loadIds: Object.freeze([...LOAD_IDS]),
  },
])

const freezeDeep = <T,>(
  value: T,
  seen: WeakSet<object> = new WeakSet<object>(),
): DeepReadonly<T> => {
  if (value === null || typeof value !== 'object') {
    return value as DeepReadonly<T>
  }

  if (seen.has(value)) {
    return value as DeepReadonly<T>
  }

  seen.add(value)

  for (const nested of Object.values(value)) {
    freezeDeep(nested, seen)
  }

  return Object.freeze(value) as DeepReadonly<T>
}

const buildScenario = (
  revision: number,
  solarKWh: readonly number[],
): ReadonlyScenario =>
  freezeDeep<Scenario>({
    id: 'wattkeep-seed',
    revision,
    household: CANONICAL_HOUSEHOLD,
    battery: CANONICAL_BATTERY,
    outage: CANONICAL_OUTAGE,
    intervals: CANONICAL_INTERVALS,
    solarKWh: [...solarKWh],
    loads: CANONICAL_LOADS,
    plans: CANONICAL_PLANS,
  })

export const CANONICAL_SOLAR_FORECAST = freezeDeep([
  ...CANONICAL_SOLAR_VALUES,
])

export const ALTERNATE_SOLAR_FORECAST = freezeDeep([
  ...ALTERNATE_SOLAR_VALUES,
])

export const RESET_SCENARIO = buildScenario(1, CANONICAL_SOLAR_FORECAST)

export const CANONICAL_SCENARIO = RESET_SCENARIO

export const ALTERNATE_SCENARIO = buildScenario(1, ALTERNATE_SOLAR_FORECAST)

export const getScenario = (): ReadonlyScenario => buildScenario(
  RESET_SCENARIO.revision,
  RESET_SCENARIO.solarKWh,
)

export const resetScenario = getScenario

export const getAlternateScenario = (): ReadonlyScenario => buildScenario(
  ALTERNATE_SCENARIO.revision,
  ALTERNATE_SCENARIO.solarKWh,
)

export const formatEnergy = (value: number): string => `${value.toFixed(2)} kWh`

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`

export const formatPower = (value: number): string => `${value.toFixed(3)} kW`

export const PLAN_IDS_IN_ORDER = PLAN_IDS
