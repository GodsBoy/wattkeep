import { describe, expect, it } from 'vitest'

import { createStore } from '../state/store'
import type { AgentCommands } from '../state/store'
import type { ModelContext, ModelContextTool } from './model-context'
import {
  createWebMcpTools,
  registerWebMcpTools,
} from './register-tools'
import { TOOL_NAMES, type ToolEnvelope } from './contracts'

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
  failAt: number | null = null
  permissionDenied = false

  registerTool = async (
    tool: ModelContextTool,
    options: { readonly signal: AbortSignal },
  ): Promise<undefined> => {
    if (this.permissionDenied || this.failAt === this.calls.length) {
      const error = new Error('denied')
      error.name = this.permissionDenied ? 'NotAllowedError' : 'RegistrationError'
      throw error
    }

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

const signalContext = (signal = new AbortController().signal) => ({ signal })

describe('WebMCP registration', () => {
  it('exports the registration entry point', () => {
    expect(registerWebMcpTools).toBeTypeOf('function')
  })

  it('falls back safely when context or registration is unavailable', async () => {
    const store = createStore({ storage: null })

    const missingContext = await registerWebMcpTools(undefined, store)
    expect(missingContext.mode).toBe('manual')
    expect(missingContext.reason).not.toContain('/')
    expect(missingContext.reason).not.toContain('Error')

    const missingMethod = await registerWebMcpTools(
      {} as Document,
      store,
    )
    expect(missingMethod.mode).toBe('manual')

    const permission = new FakeModelContext()
    permission.permissionDenied = true
    const denied = await registerWebMcpTools(documentFor(permission), store)
    expect(denied.mode).toBe('manual')
    expect(denied.reason).toContain('not permitted')
    expect(permission.tools.size).toBe(0)
  })

  it('aborts every prior registration when a later registration fails', async () => {
    const context = new FakeModelContext()
    context.failAt = 3
    const registration = await registerWebMcpTools(
      documentFor(context),
      createStore({ storage: null }),
    )

    expect(registration.mode).toBe('manual')
    expect(context.calls).toHaveLength(3)
    expect(context.tools.size).toBe(0)
    expect(context.calls.every((tool) => tool.registrationSignal.aborted)).toBe(true)
  })

  it('cleans up one lifecycle idempotently and permits strict-mode re-registration', async () => {
    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const first = await registerWebMcpTools(documentFor(context), store)
    expect(first.mode).toBe('webmcp')
    expect(context.tools.size).toBe(8)

    first.cleanup()
    first.cleanup()
    expect(context.tools.size).toBe(0)
    expect(context.calls.every((tool) => tool.registrationSignal.aborted)).toBe(true)

    const second = await registerWebMcpTools(documentFor(context), store)
    expect(second.mode).toBe('webmcp')
    expect([...context.tools.keys()]).toEqual(TOOL_NAMES)
    second.cleanup()
  })

  it('uses live state at invocation time and never registers human-only actions', async () => {
    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const registration = await registerWebMcpTools(documentFor(context), store)
    expect(context.calls.map((tool) => tool.name)).toEqual(TOOL_NAMES)
    expect(context.calls.some((tool) => (
      ['approve', 'approve_plan', 'commit', 'refresh', 'reset', 'undo'].includes(tool.name)
    ))).toBe(false)

    const before = await toolFor(context, 'inspect_home').execute({}, signalContext())
    expect(before).toMatchObject({ state: { workspaceRevision: 1 } })
    const refreshed = store.human.refreshForecast()
    expect(refreshed.ok).toBe(true)
    const after = await toolFor(context, 'inspect_home').execute({}, signalContext())
    expect(after).toMatchObject({
      state: {
        workspaceRevision: 2,
        activeProposal: null,
      },
    })

    registration.cleanup()
  })

  it('cannot commit or undo, while later human transitions remain visible', async () => {
    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const registration = await registerWebMcpTools(documentFor(context), store)
    const simulation = await toolFor(context, 'simulate_plan').execute({
      planId: 'balanced-night',
    }, signalContext())
    if (!simulation.ok || typeof simulation.data !== 'object' || simulation.data === null
      || !('simulationId' in simulation.data)
      || typeof simulation.data.simulationId !== 'string') {
      throw new Error('Expected a simulation result')
    }
    const staged = await toolFor(context, 'stage_plan').execute({
      simulationId: simulation.data.simulationId,
    }, signalContext())
    if (!staged.ok || typeof staged.data !== 'object' || staged.data === null
      || !('proposalId' in staged.data) || typeof staged.data.proposalId !== 'string') {
      throw new Error('Expected a staged proposal')
    }
    expect(store.getSnapshot().committedPolicy.planId).toBe('essential-reserve')
    expect(await toolFor(context, 'request_review').execute({
      proposalId: staged.data.proposalId,
    }, signalContext())).toMatchObject({ ok: true })
    expect(store.getSnapshot().committedPolicy.planId).toBe('essential-reserve')

    const capability = store.human.createCommitCapability(staged.data.proposalId)
    if (!capability.ok) {
      throw new Error('Expected a human commit capability')
    }
    expect(store.human.commit(capability.data)).toMatchObject({ ok: true })
    const committed = await toolFor(context, 'inspect_home').execute({}, signalContext())
    expect(committed).toMatchObject({
      ok: true,
      data: { committedPolicy: { planId: 'balanced-night' } },
      state: { workspaceRevision: 2 },
    })

    expect(store.human.undo()).toMatchObject({ ok: true })
    const undone = await toolFor(context, 'inspect_home').execute({}, signalContext())
    expect(undone).toMatchObject({
      ok: true,
      data: { committedPolicy: { planId: 'essential-reserve' } },
      state: { workspaceRevision: 3 },
    })

    expect(store.human.reset()).toMatchObject({ ok: true })
    const reset = await toolFor(context, 'inspect_home').execute({}, signalContext())
    expect(reset).toMatchObject({
      ok: true,
      state: { sessionEpoch: 2, workspaceRevision: 1 },
    })
    registration.cleanup()
  })

  it('covers the inspect, simulate, compare, stage, explain, review, and discard path', async () => {
    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const registration = await registerWebMcpTools(documentFor(context), store)

    const inspect = await toolFor(context, 'inspect_home').execute({}, signalContext())
    expect(inspect).toMatchObject({ ok: true, tool: 'inspect_home' })
    const outage = await toolFor(context, 'inspect_outage').execute({}, signalContext())
    expect(outage).toMatchObject({ ok: true, tool: 'inspect_outage' })

    const simulation = await toolFor(context, 'simulate_plan').execute({
      planId: 'balanced-night',
    }, signalContext())
    if (!simulation.ok || typeof simulation.data !== 'object' || simulation.data === null) {
      throw new Error('Expected a simulation result')
    }
    const simulationId = 'simulationId' in simulation.data
      && typeof simulation.data.simulationId === 'string'
      ? simulation.data.simulationId
      : ''
    expect(simulationId).not.toBe('')

    const comparison = await toolFor(context, 'compare_plans').execute({
      planIds: ['essential-reserve', 'balanced-night', 'comfort-carry'],
    }, signalContext())
    expect(comparison).toMatchObject({ ok: true, tool: 'compare_plans' })

    const explanation = await toolFor(context, 'explain_interval').execute({
      simulationId,
      intervalIndex: 0,
    }, signalContext())
    expect(explanation).toMatchObject({ ok: true, tool: 'explain_interval' })

    const staged = await toolFor(context, 'stage_plan').execute({ simulationId }, signalContext())
    if (!staged.ok || typeof staged.data !== 'object' || staged.data === null
      || !('proposalId' in staged.data) || typeof staged.data.proposalId !== 'string') {
      throw new Error('Expected a staged proposal')
    }
    expect(staged.state.activeProposal).toMatchObject({
      proposalId: staged.data.proposalId,
      status: 'staged',
    })

    const reviewed = await toolFor(context, 'request_review').execute({
      proposalId: staged.data.proposalId,
    }, signalContext())
    expect(reviewed).toMatchObject({
      ok: true,
      tool: 'request_review',
      state: { activeProposal: { status: 'review-requested' } },
    })

    const discarded = await toolFor(context, 'discard_plan').execute({
      proposalId: staged.data.proposalId,
    }, signalContext())
    expect(discarded).toMatchObject({
      ok: true,
      tool: 'discard_plan',
      state: { activeProposal: null },
    })
    registration.cleanup()
  })

  it('cancels before and during read-only execution', async () => {
    const context = new FakeModelContext()
    const store = createStore({ storage: null })
    const registration = await registerWebMcpTools(documentFor(context), store)
    const controller = new AbortController()
    controller.abort()
    const before = await toolFor(context, 'simulate_plan').execute({
      planId: 'balanced-night',
    }, signalContext(controller.signal))
    expect(before).toMatchObject({
      ok: false,
      tool: 'simulate_plan',
      error: { code: 'CANCELLED' },
    })

    let resolveSimulation: ((value: Awaited<ReturnType<AgentCommands['simulatePlan']>>) => void) | undefined
    const deferred = new Promise<Awaited<ReturnType<AgentCommands['simulatePlan']>>>((resolve) => {
      resolveSimulation = resolve
    })
    const deferredAgent: AgentCommands = {
      ...store.agent,
      simulatePlan: () => deferred,
    }
    const deferredTools = createWebMcpTools({
      agent: deferredAgent,
      getSnapshot: store.getSnapshot,
    })
    const deferredTool = deferredTools.find((tool) => tool.name === 'simulate_plan') as RegisteredTool | undefined
    if (deferredTool === undefined) {
      throw new Error('Missing simulate_plan tool')
    }
    const duringController = new AbortController()
    const during = deferredTool.execute({ planId: 'balanced-night' }, signalContext(duringController.signal))
    duringController.abort()
    resolveSimulation?.(await store.agent.simulatePlan('balanced-night'))
    await expect(during).resolves.toMatchObject({
      ok: false,
      error: { code: 'CANCELLED' },
    })

    registration.cleanup()
  })

  it('returns a mutating result after cancellation fires at the transition', async () => {
    const controller = new AbortController()
    const sourceStore = createStore({ storage: null })
    const simulation = await sourceStore.agent.simulatePlan('balanced-night')
    if (!simulation.ok) {
      throw new Error('Expected a simulation result')
    }
    const stagePlan: AgentCommands['stagePlan'] = (...args) => {
      const outcome = sourceStore.agent.stagePlan(...args)
      controller.abort()
      return outcome
    }
    const source = {
      agent: {
        ...sourceStore.agent,
        stagePlan,
      },
      getSnapshot: sourceStore.getSnapshot,
    }
    const tools = createWebMcpTools(source)
    const stage = tools.find((tool) => tool.name === 'stage_plan') as RegisteredTool | undefined
    if (stage === undefined) {
      throw new Error('Missing stage_plan tool')
    }

    await expect(stage.execute({
      simulationId: simulation.data.simulationId,
    }, signalContext(controller.signal))).resolves.toMatchObject({
      ok: true,
      tool: 'stage_plan',
    })
  })
})
