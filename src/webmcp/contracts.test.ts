import { describe, expect, it } from 'vitest'

import {
  PLAN_IDS,
  TOOL_CONTRACTS,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  validateToolInput,
} from './contracts'
import { createStore } from '../state/store'
import type { ModelContext, ModelContextTool } from './model-context'
import { registerWebMcpTools } from './register-tools'

const expectFailure = (value: unknown, code: string): void => {
  expect(value).toMatchObject({ ok: false, error: { code } })
}

type RegisteredTool = ModelContextTool & { readonly registrationSignal: AbortSignal }

class FakeModelContext implements ModelContext {
  readonly tools = new Map<string, RegisteredTool>()
  readonly calls: RegisteredTool[] = []

  registerTool = async (
    tool: ModelContextTool,
    options: { readonly signal: AbortSignal },
  ): Promise<undefined> => {
    const registered = { ...tool, registrationSignal: options.signal }
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
    expect(JSON.stringify(simulation).length).toBeLessThan(50_000)

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
