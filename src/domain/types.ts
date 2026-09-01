export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type PlanId =
  | 'essential-reserve'
  | 'balanced-night'
  | 'comfort-carry'

export type LoadId =
  | 'fridge'
  | 'wifi'
  | 'security'
  | 'medical-cooler'
  | 'lighting'
  | 'fan'
  | 'entertainment'
  | 'workstation'
  | 'water-heater'
  | 'pool-pump'

export interface Household {
  readonly id: string
  readonly name: string
}

export interface Battery {
  readonly capacityKWh: number
  readonly startEnergyKWh: number
  readonly startChargePercent: number
  readonly reserveKWh: number
  readonly reservePercent: number
}

export interface Outage {
  readonly start: string
  readonly end: string
  readonly intervalHours: number
  readonly intervalCount: number
}

export interface ScenarioInterval {
  readonly index: number
  readonly start: string
  readonly end: string
  readonly label: string
}

export interface LoadDefinition {
  readonly id: LoadId
  readonly name: string
  readonly drawKW: number
  readonly activeIntervalsByPlan: Readonly<
    Record<PlanId, readonly number[]>
  >
}

export interface PlanPreset {
  readonly id: PlanId
  readonly name: string
  readonly description: string
  readonly loadIds: readonly LoadId[]
}

export interface Scenario {
  readonly id: string
  readonly revision: number
  readonly household: Household
  readonly battery: Battery
  readonly outage: Outage
  readonly intervals: readonly ScenarioInterval[]
  readonly solarKWh: readonly number[]
  readonly loads: readonly LoadDefinition[]
  readonly plans: readonly PlanPreset[]
}

export type ReadonlyScenario = DeepReadonly<Scenario>
