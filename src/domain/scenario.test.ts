import { describe, expect, it } from 'vitest'

import {
  ALTERNATE_SOLAR_FORECAST,
  CANONICAL_SCENARIO,
  RESET_SCENARIO,
  formatEnergy,
  formatPercent,
  getAlternateScenario,
  getScenario,
} from './scenario'

describe('canonical WattKeep scenario', () => {
  it('resets to the canonical household, outage, intervals, loads, and plans', () => {
    const scenario = getScenario()

    expect(scenario).toEqual(RESET_SCENARIO)
    expect(scenario.revision).toBe(1)
    expect(scenario.battery).toMatchObject({
      capacityKWh: 13.5,
      startEnergyKWh: 10.53,
      startChargePercent: 78,
      reserveKWh: 2.7,
      reservePercent: 20,
    })
    expect(scenario.outage).toMatchObject({
      start: '18:00',
      end: '06:00',
      intervalHours: 1,
    })
    expect(scenario.intervals.map((interval) => interval.label)).toEqual([
      '18:00 to 19:00',
      '19:00 to 20:00',
      '20:00 to 21:00',
      '21:00 to 22:00',
      '22:00 to 23:00',
      '23:00 to 00:00',
      '00:00 to 01:00',
      '01:00 to 02:00',
      '02:00 to 03:00',
      '03:00 to 04:00',
      '04:00 to 05:00',
      '05:00 to 06:00',
    ])
    expect(scenario.solarKWh).toEqual([
      0.15, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.25,
    ])
    expect(scenario.loads.map((load) => load.name)).toEqual([
      'Fridge',
      'Wi-Fi',
      'Security',
      'Medical cooler',
      'Lighting',
      'Fan',
      'Entertainment',
      'Workstation',
      'Water heater',
      'Pool pump',
    ])
    expect(scenario.plans.map((plan) => plan.name)).toEqual([
      'Essential Reserve',
      'Balanced Night',
      'Comfort Carry',
    ])
  })

  it('keeps the alternate forecast limited to the two owned solar values', () => {
    const alternate = getAlternateScenario()

    expect(ALTERNATE_SOLAR_FORECAST).toEqual([
      0.15, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1,
    ])
    expect(alternate).toEqual({
      ...CANONICAL_SCENARIO,
      solarKWh: ALTERNATE_SOLAR_FORECAST,
    })
  })

  it('does not allow consumers to mutate returned fixture values', () => {
    const first = getScenario()
    const originalName = first.loads[0].name
    const originalSolar = first.solarKWh[0]

    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.loads)).toBe(true)
    expect(Object.isFrozen(first.loads[0])).toBe(true)
    expect(Object.isFrozen(first.solarKWh)).toBe(true)

    expect(Reflect.set(first.loads[0], 'name', 'Changed')).toBe(false)
    expect(Reflect.set(first.solarKWh, 0, 99)).toBe(false)
    expect(first.loads[0].name).toBe(originalName)
    expect(first.solarKWh[0]).toBe(originalSolar)

    const second = getScenario()
    expect(second.loads[0].name).toBe(originalName)
    expect(second.solarKWh[0]).toBe(originalSolar)
  })

  it('formats fixed units and rounding without changing source precision', () => {
    const sourceEnergy = 10.526
    const sourcePercent = 77.777

    expect(formatEnergy(sourceEnergy)).toBe('10.53 kWh')
    expect(formatPercent(sourcePercent)).toBe('77.8%')
    expect(sourceEnergy).toBe(10.526)
    expect(sourcePercent).toBe(77.777)
  })
})
