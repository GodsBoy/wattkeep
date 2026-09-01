import { describe, expect, it } from 'vitest'

import {
  PLAN_IDS,
  TOOL_CONTRACTS,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  type ToolEnvelope,
  validateToolInput,
} from './contracts'
import { createStore } from '../state/store'
import type { ModelContext, ModelContextTool } from './model-context'
import { registerWebMcpTools } from './register-tools'

const expectFailure = (value: unknown, code: string): void => {
  expect(value).toMatchObject({ ok: false, error: { code } })
}

type RegisteredTool = Omit<ModelContextTool, 'execute'> & {
  readonly execute: (
    input: unknown,
    context: { readonly signal: AbortSignal },
  ) => Promise<ToolEnvelope>
  readonly registrationSignal: AbortSignal
}

class FakeModelContext implements ModelContext {
  readonly tools = new Map<string, RegisteredTool>()
  readonly calls: RegisteredTool[] = []

  registerTool = async (
    tool: ModelContextTool,
    options: { readonly signal: AbortSignal },
  ): Promise<undefined> => {
    const registered = { ...tool, registrationSignal: options.signal } as RegisteredTool
    this.calls.push(registered)
    this.tools.set(tool.name, registered)
    options.signal.addEventListener('abort', () => {
      this.tools.delete(tool.name)
    }, { once: true })
    return undefined
  }
}

const documentFor = (context: ModelContext): Document => ({
  modelContext: context,
} as unknown as Document)

const toolFor = (context: FakeModelContext, name: string): RegisteredTool => {
  const tool = context.tools.get(name)
  if (tool === undefined) {
    throw new Error(`Missing tool ${name}`)
  }
  return tool
}

describe('WebMCP contracts', () => {
  it('exposes exactly eight unique names and no human-only aliases', () => {
    expect(TOOL_NAMES).toEqual([
      'inspect_home',
      'inspect_outage',
      'simulate_plan',
      'compare_plans',
      'stage_plan',
      'explain_interval',
      'discard_plan',
      'request_review',
    ])
    expect(new Set(TOOL_NAMES).size).toBe(8)
    expect(TOOL_NAMES.some((name) => (
      ['approve_plan', 'approve', 'commit', 'refresh', 'reset', 'undo'].includes(name)
    ))).toBe(false)
    expect(TOOL_CONTRACTS.map((contract) => contract.name)).toEqual(TOOL_NAMES)
  })

  it('publishes closed schemas and the required safety annotations', () => {
    expect(TOOL_CONTRACTS).toHaveLength(8)

    for (const contract of TOOL_CONTRACTS) {
      expect(contract.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      })
      expect(contract.annotations.untrustedContentHint).toBe(false)
      expect(contract.description.length).toBeGreaterThan(20)
    }

    expect(TOOL_SCHEMAS.inspect_home).toMatchObject({
      required: [],
      properties: {},
    })
    expect(TOOL_SCHEMAS.inspect_outage).toMatchObject({
      required: [],
      properties: {},
    })
    expect(TOOL_SCHEMAS.simulate_plan).toMatchObject({
      required: ['planId'],
      properties: { planId: { type: 'string', enum: PLAN_IDS } },
    })
    expect(TOOL_SCHEMAS.compare_plans).toMatchObject({
      required: ['planIds'],
      properties: {
        planIds: {
          type: 'array',
          minItems: 2,
          maxItems: 3,
          uniqueItems: true,
          items: { type: 'string', enum: PLAN_IDS },
        },
      },
    })
    expect(TOOL_SCHEMAS.stage_plan).toMatchObject({
      required: ['simulationId'],
      properties: {
        simulationId: { type: 'string', minLength: 1 },
        replaceProposalId: { type: 'string', minLength: 1 },
      },
    })
    expect(TOOL_SCHEMAS.explain_interval).toMatchObject({
      required: ['simulationId', 'intervalIndex'],
      properties: {
        intervalIndex: { type: 'integer', minimum: 0, maximum: 11 },
      },
    })
    expect(TOOL_SCHEMAS.discard_plan.required).toEqual(['proposalId'])
    expect(TOOL_SCHEMAS.request_review.required).toEqual(['proposalId'])
    expect(Object.fromEntries(TOOL_CONTRACTS.map((contract) => [
      contract.name,
      contract.annotations.readOnlyHint,
    ]))).toEqual({
      inspect_home: true,
      inspect_outage: true,
      simulate_plan: true,
      compare_plans: true,
      stage_plan: false,
      explain_interval: true,
      discard_plan: false,
      request_review: false,
    })
  })

  it('strictly validates closed inputs without touching the store', async () => {
    const invalidInputs: readonly [string, unknown][] = [
      ['inspect_home', { unexpected: true }],
      ['inspect_home', Object.create({ unexpected: true })],
      ['inspect_outage', null],
      ['simulate_plan', { planId: 'balanced-night', extra: true }],
      ['simulate_plan', { planId: 'not-a-plan' }],
      ['compare_plans', { planIds: ['balanced-night'] }],
      ['compare_plans', { planIds: ['balanced-night', 'balanced-night'] }],
      ['compare_plans', { planIds: ['balanced-night', 1] }],
      ['stage_plan', { simulationId: 'simulation-id', replaceProposalId: '' }],
      ['stage_plan', { simulationId: 'simulation-id', forged: 'value' }],
      ['explain_interval', { simulationId: 'simulation-id', intervalIndex: 12 }],
      ['explain_interval', { simulationId: 'simulation-id', intervalIndex: 1.5 }],
      ['discard_plan', { proposalId: 'x'.repeat(257) }],
      ['request_review', { proposalId: 4 }],
    ]

    for (const [tool, input] of invalidInputs) {
      const result = validateToolInput(tool, input)
      expectFailure(result, 'INVALID_INPUT')
    }

    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const before = store.getSnapshot()
    const registration = await registerWebMcpTools(documentFor(context), store)
    expect(registration.mode).toBe('webmcp')

    for (const [tool, input] of invalidInputs) {
      const result = await toolFor(context, tool).execute(input, {
        signal: new AbortController().signal,
      })
      expectFailure(result, 'INVALID_INPUT')
      expect(store.getSnapshot()).toBe(before)
    }

    registration.cleanup()
  })

  it('returns compact JSON-serialisable envelopes and live state', async () => {
    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const registration = await registerWebMcpTools(documentFor(context), store)

    const inspect = await toolFor(context, 'inspect_home').execute({}, {
      signal: new AbortController().signal,
    })
    expect(inspect).toMatchObject({
      ok: true,
      tool: 'inspect_home',
      state: {
        sessionEpoch: 1,
        workspaceRevision: 1,
        activeProposal: null,
        persistenceMode: 'memory-only',
      },
    })
    expect(() => JSON.stringify(inspect)).not.toThrow()
    expect(JSON.stringify(inspect).length).toBeLessThan(50_000)

    const simulation = await toolFor(context, 'simulate_plan').execute({
      planId: 'balanced-night',
    }, { signal: new AbortController().signal })
    expect(simulation).toMatchObject({ ok: true, tool: 'simulate_plan' })
    const simulationJson = JSON.stringify(simulation)
    expect(simulationJson).toContain('"intervals"')
    expect(simulationJson.length).toBeGreaterThan(1_500)

    const comparison = await toolFor(context, 'compare_plans').execute({
      planIds: ['essential-reserve', 'balanced-night', 'comfort-carry'],
    }, { signal: new AbortController().signal })
    if (!comparison.ok || typeof comparison.data !== 'object' || comparison.data === null) {
      throw new Error('Expected a compact comparison result')
    }
    const comparisonData = comparison.data as Record<string, unknown>
    const rankedValue = comparisonData.ranked
    if (!Array.isArray(rankedValue)
      || rankedValue.some((entry) => typeof entry !== 'object' || entry === null)) {
      throw new Error('Expected ranked comparison summaries')
    }
    const ranked = rankedValue as Record<string, unknown>[]
    expect(Object.keys(comparisonData)).toEqual(['requestedPlanIds', 'ranked'])
    expect(ranked).toHaveLength(3)
    for (const entry of ranked) {
      expect(Object.keys(entry)).toEqual([
        'rank',
        'planId',
        'planName',
        'simulationId',
        'fingerprint',
        'feasible',
        'coverage',
        'endEnergyKWh',
        'endChargePercent',
        'firstBreachIndex',
        'tradeOffReason',
      ])
      expect(entry).not.toHaveProperty('intervals')
    }
    const expectedComparisonData = {
      requestedPlanIds: ['essential-reserve', 'balanced-night', 'comfort-carry'],
      ranked: ranked.map((entry) => ({
        rank: entry.rank,
        planId: entry.planId,
        planName: entry.planName,
        simulationId: entry.simulationId,
        fingerprint: entry.fingerprint,
        feasible: entry.feasible,
        coverage: entry.coverage,
        endEnergyKWh: entry.endEnergyKWh,
        endChargePercent: entry.endChargePercent,
        firstBreachIndex: entry.firstBreachIndex,
        tradeOffReason: entry.tradeOffReason,
      })),
    }
    expect(comparisonData).toEqual(expectedComparisonData)
    const expectedComparison = {
      ok: true,
      tool: 'compare_plans',
      data: expectedComparisonData,
      state: {
        sessionEpoch: 1,
        workspaceRevision: 1,
        activeProposal: null,
        persistenceMode: 'memory-only',
        nextActions: ['Choose a feasible plan to stage.'],
      },
    }
    expect(JSON.stringify(comparison)).toBe(JSON.stringify(expectedComparison))
    expect(JSON.stringify(comparison).length).toBeLessThan(1_500)

    if (!simulation.ok || typeof simulation.data !== 'object' || simulation.data === null
      || !('simulationId' in simulation.data) || typeof simulation.data.simulationId !== 'string') {
      throw new Error('Expected a simulation result')
    }
    const staged = await toolFor(context, 'stage_plan').execute({
      simulationId: simulation.data.simulationId,
    }, { signal: new AbortController().signal })
    if (!staged.ok || typeof staged.data !== 'object' || staged.data === null
      || !('proposalId' in staged.data) || typeof staged.data.proposalId !== 'string') {
      throw new Error('Expected a staged proposal')
    }
    const stagedData = staged.data as Record<string, unknown>
    const stagedAssumptions = stagedData.assumptions as Record<string, unknown>
    const stagedBattery = stagedAssumptions.battery as Record<string, unknown>
    const stagedOutage = stagedAssumptions.outage as Record<string, unknown>
    const stagedSimulation = stagedData.simulation as Record<string, unknown>
    const stagedBeforePolicy = stagedData.beforePolicy as Record<string, unknown>
    const stagedAfterPolicy = stagedData.afterPolicy as Record<string, unknown>
    const stagedDiff = stagedData.diff as Record<string, unknown>
    expect(Object.keys(stagedData)).toEqual([
      'proposalId',
      'status',
      'baseRevision',
      'currentRevision',
      'simulationId',
      'simulationFingerprint',
      'scenarioId',
      'planId',
      'planName',
      'assumptions',
      'simulation',
      'beforePolicy',
      'afterPolicy',
      'diff',
    ])
    expect(Object.keys(stagedAssumptions)).toEqual([
      'scenarioRevision',
      'workspaceRevision',
      'forecastKind',
      'battery',
      'outage',
      'solarKWh',
      'reserveKWh',
    ])
    expect(Object.keys(stagedBattery)).toEqual([
      'capacityKWh',
      'startEnergyKWh',
      'reserveKWh',
    ])
    expect(Object.keys(stagedOutage)).toEqual([
      'start',
      'end',
      'intervalHours',
      'intervalCount',
    ])
    expect(Object.keys(stagedSimulation)).toEqual([
      'endEnergyKWh',
      'endChargePercent',
      'feasible',
      'firstBreachIndex',
      'coverage',
    ])
    expect(Object.keys(stagedBeforePolicy)).toEqual(['planId', 'planName', 'loadIds'])
    expect(Object.keys(stagedAfterPolicy)).toEqual(['planId', 'planName', 'loadIds'])
    expect(Object.keys(stagedDiff)).toEqual([
      'addedLoadIds',
      'removedLoadIds',
      'unchangedLoadIds',
      'changed',
    ])
    expect(stagedData).not.toHaveProperty('proposal')
    expect(stagedData.simulation).not.toHaveProperty('intervals')
    const expectedStageData = {
      proposalId: stagedData.proposalId,
      status: 'staged',
      baseRevision: 1,
      currentRevision: 1,
      simulationId: stagedData.simulationId,
      simulationFingerprint: stagedData.simulationFingerprint,
      scenarioId: 'wattkeep-seed',
      planId: 'balanced-night',
      planName: 'Balanced Night',
      assumptions: {
        scenarioRevision: 1,
        workspaceRevision: 1,
        forecastKind: 'canonical',
        battery: {
          capacityKWh: 13.5,
          startEnergyKWh: 10.53,
          reserveKWh: 2.7,
        },
        outage: {
          start: '18:00',
          end: '06:00',
          intervalHours: 1,
          intervalCount: 12,
        },
        solarKWh: [0.15, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.25],
        reserveKWh: 2.7,
      },
      simulation: {
        endEnergyKWh: stagedSimulation.endEnergyKWh,
        endChargePercent: stagedSimulation.endChargePercent,
        feasible: true,
        firstBreachIndex: null,
        coverage: 100,
      },
      beforePolicy: {
        planId: 'essential-reserve',
        planName: 'Essential Reserve',
        loadIds: ['fridge', 'wifi', 'security', 'medical-cooler'],
      },
      afterPolicy: {
        planId: 'balanced-night',
        planName: 'Balanced Night',
        loadIds: ['fridge', 'wifi', 'security', 'medical-cooler', 'lighting', 'fan', 'entertainment'],
      },
      diff: {
        addedLoadIds: ['lighting', 'fan', 'entertainment'],
        removedLoadIds: [],
        unchangedLoadIds: ['fridge', 'wifi', 'security', 'medical-cooler'],
        changed: true,
      },
    }
    expect(stagedData).toEqual(expectedStageData)
    const expectedStage = {
      ok: true,
      tool: 'stage_plan',
      data: expectedStageData,
      state: {
        sessionEpoch: 1,
        workspaceRevision: 1,
        activeProposal: {
          proposalId: stagedData.proposalId,
          status: 'staged',
        },
        persistenceMode: 'memory-only',
        nextActions: ['Request human review of the staged proposal.'],
      },
    }
    expect(JSON.stringify(staged)).toBe(JSON.stringify(expectedStage))
    expect(JSON.stringify(staged).length).toBeLessThan(1_500)

    const reviewed = await toolFor(context, 'request_review').execute({
      proposalId: staged.data.proposalId,
    }, { signal: new AbortController().signal })
    if (!reviewed.ok || typeof reviewed.data !== 'object' || reviewed.data === null) {
      throw new Error('Expected a compact review result')
    }
    const reviewedData = reviewed.data as Record<string, unknown>
    expect(Object.keys(reviewedData)).toEqual(Object.keys(expectedStageData))
    expect(reviewedData).not.toHaveProperty('proposal')
    expect(reviewedData).toEqual({ ...expectedStageData, status: 'review-requested' })
    const expectedReview = {
      ok: true,
      tool: 'request_review',
      data: { ...expectedStageData, status: 'review-requested' },
      state: {
        sessionEpoch: 1,
        workspaceRevision: 1,
        activeProposal: {
          proposalId: stagedData.proposalId,
          status: 'review-requested',
        },
        persistenceMode: 'memory-only',
        nextActions: ['Review the staged proposal in the WattKeep interface.'],
      },
    }
    expect(JSON.stringify(reviewed)).toBe(JSON.stringify(expectedReview))
    expect(JSON.stringify(reviewed).length).toBeLessThan(1_500)

    const humanRefresh = store.human.refreshForecast()
    expect(humanRefresh.ok).toBe(true)
    const outage = await toolFor(context, 'inspect_outage').execute({}, {
      signal: new AbortController().signal,
    })
    expect(outage).toMatchObject({
      ok: true,
      state: { workspaceRevision: 2 },
    })
    expect(JSON.stringify(outage)).not.toContain('currentScenario')
    expect(JSON.stringify(outage)).not.toContain('simulationCache')

    registration.cleanup()
  })
})
