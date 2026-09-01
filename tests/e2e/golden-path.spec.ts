import { expect, test, type Page } from '@playwright/test'

import { fakeModelContextInitScript } from '../support/fake-model-context'

const TOOL_NAMES = [
  'inspect_home',
  'inspect_outage',
  'simulate_plan',
  'compare_plans',
  'stage_plan',
  'explain_interval',
  'discard_plan',
  'request_review',
] as const

const PLAN_IDS = [
  'essential-reserve',
  'balanced-night',
  'comfort-carry',
] as const

type ToolName = typeof TOOL_NAMES[number]
type ToolResult = {
  readonly ok: boolean
  readonly tool?: string
  readonly data?: unknown
  readonly error?: { readonly code?: string }
  readonly state?: {
    readonly activeProposal?: { readonly proposalId: string; readonly status: string } | null
    readonly workspaceRevision?: number
  }
}

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object result.')
  }
  return value as Record<string, unknown>
}

const simulationIdFrom = (result: ToolResult): string => {
  const data = record(result.data)
  if (typeof data.simulationId !== 'string') {
    throw new Error('Expected a simulation ID.')
  }
  return data.simulationId
}

const proposalIdFrom = (result: ToolResult): string => {
  const data = record(result.data)
  if (typeof data.proposalId !== 'string') {
    throw new Error('Expected a proposal ID.')
  }
  return data.proposalId
}

const executeTool = async (
  page: Page,
  name: ToolName,
  input: Record<string, unknown>,
): Promise<ToolResult> => page.evaluate(async ({ name: toolName, input: toolInput }) => {
  const state = (globalThis as typeof globalThis & {
    __wattkeepFakeModelContext?: {
      readonly tools: Record<string, {
        execute: (value: unknown, context: { readonly signal: AbortSignal }) => Promise<unknown>
      }>
    }
  }).__wattkeepFakeModelContext
  const tool = state?.tools[toolName]
  if (tool === undefined) {
    throw new Error(`Missing fake tool ${toolName}`)
  }
  const controller = new AbortController()
  return await tool.execute(toolInput, { signal: controller.signal }) as ToolResult
}, { name, input })

const registeredToolNames = async (page: Page): Promise<string[]> => (
  page.evaluate(() => {
    const state = (globalThis as typeof globalThis & {
      __wattkeepFakeModelContext?: { readonly tools: Record<string, unknown> }
    }).__wattkeepFakeModelContext
    return Object.keys(state?.tools ?? {})
  })
)

test.describe('WebMCP golden path', () => {
  test('runs the page tools, synchronises the proposal, then commits and undoes by human action', async ({ page }) => {
    await page.addInitScript({ content: fakeModelContextInitScript() })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Make stored energy last.' })).toBeVisible()
    await expect(page.getByText('WebMCP tools registered')).toBeVisible()
    await expect.poll(() => registeredToolNames(page)).toEqual([...TOOL_NAMES])

    const inspectHome = await executeTool(page, 'inspect_home', {})
    expect(inspectHome).toMatchObject({ ok: true, tool: 'inspect_home' })
    const inspectOutage = await executeTool(page, 'inspect_outage', {})
    expect(inspectOutage).toMatchObject({ ok: true, tool: 'inspect_outage' })

    const simulations = await Promise.all(PLAN_IDS.map((planId) => (
      executeTool(page, 'simulate_plan', { planId })
    )))
    expect(simulations.every((result) => result.ok)).toBe(true)
    const balancedSimulationId = simulationIdFrom(simulations[1])

    const comparison = await executeTool(page, 'compare_plans', {
      planIds: ['essential-reserve', 'balanced-night', 'comfort-carry'],
    })
    expect(comparison).toMatchObject({ ok: true, tool: 'compare_plans' })

    const explanation = await executeTool(page, 'explain_interval', {
      simulationId: balancedSimulationId,
      intervalIndex: 1,
    })
    expect(explanation).toMatchObject({ ok: true, tool: 'explain_interval' })
    // Tool execution selects the simulation and interval in the human-facing
    // timeline as soon as the evidence is cached.
    await expect(page.getByRole('heading', { name: '19:00 to 20:00' })).toBeVisible()

    const staged = await executeTool(page, 'stage_plan', {
      simulationId: balancedSimulationId,
    })
    expect(staged).toMatchObject({
      ok: true,
      tool: 'stage_plan',
      state: { activeProposal: { status: 'staged' } },
    })
    const proposalId = proposalIdFrom(staged)
    await expect(page.locator('.proposal-content')).toContainText('Essential Reserve')
    await expect(page.locator('.proposal-content')).toContainText('Balanced Night')

    const reviewed = await executeTool(page, 'request_review', { proposalId })
    expect(reviewed).toMatchObject({
      ok: true,
      tool: 'request_review',
      state: { activeProposal: { status: 'review-requested', proposalId } },
    })
    await expect(page.getByRole('button', { name: 'Review and commit' })).toBeVisible()
    await expect(page.locator('.proposal-column--before')).toContainText('Essential Reserve')
    await expect(page.locator('.proposal-column--after')).toContainText('Balanced Night')

    const names = await registeredToolNames(page)
    expect(names).toEqual([...TOOL_NAMES])
    expect(names).not.toContain('approve')
    expect(names).not.toContain('approve_plan')
    expect(names).not.toContain('commit')
    expect(names).not.toContain('undo')

    await page.getByRole('button', { name: 'Review and commit' }).click()
    await expect(page.getByRole('dialog', { name: /Review and commit Balanced Night/ })).toBeVisible()
    await page.getByRole('button', { name: 'Confirm commit' }).click()
    await expect(page.getByText('Committed Balanced Night')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo latest change' })).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'Operation journal' })).toBeVisible()
    await expect(page.getByText('Policy committed')).toBeVisible()

    const committed = await executeTool(page, 'inspect_home', {})
    expect(committed).toMatchObject({
      ok: true,
      data: { committedPolicy: { planId: 'balanced-night' } },
      state: { workspaceRevision: 2 },
    })

    await page.getByRole('button', { name: 'Undo latest change' }).click()
    await expect(page.getByText(/Undo completed\. Essential Reserve is restored/)).toBeVisible()
    const undone = await executeTool(page, 'inspect_home', {})
    expect(undone).toMatchObject({
      ok: true,
      data: { committedPolicy: { planId: 'essential-reserve' } },
      state: { workspaceRevision: 3 },
    })
    await expect(page.getByText('Commit undone')).toBeVisible()
  })

  test('handles cancellation before and during reads, while preserving a mutating result cancelled afterwards', async ({ page }) => {
    await page.addInitScript({ content: fakeModelContextInitScript() })
    await page.goto('/')
    await expect.poll(() => registeredToolNames(page)).toEqual([...TOOL_NAMES])

    const cancellation = await page.evaluate(async () => {
      const state = (globalThis as typeof globalThis & {
        __wattkeepFakeModelContext?: {
          readonly tools: Record<string, {
            execute: (value: unknown, context: { readonly signal: AbortSignal }) => Promise<unknown>
          }>
        }
      }).__wattkeepFakeModelContext
      const simulate = state?.tools.simulate_plan
      const stage = state?.tools.stage_plan
      if (simulate === undefined || stage === undefined) {
        throw new Error('Missing cancellation test tools')
      }

      const beforeController = new AbortController()
      beforeController.abort()
      const before = await simulate.execute(
        { planId: 'balanced-night' },
        { signal: beforeController.signal },
      )

      const duringController = new AbortController()
      const duringPromise = simulate.execute(
        { planId: 'balanced-night' },
        { signal: duringController.signal },
      )
      duringController.abort()
      const during = await duringPromise

      const simulationController = new AbortController()
      const simulation = await simulate.execute(
        { planId: 'balanced-night' },
        { signal: simulationController.signal },
      ) as { readonly data?: { readonly simulationId?: string } }
      const simulationId = simulation.data?.simulationId
      if (simulationId === undefined) {
        throw new Error('Expected a simulation before mutating cancellation test')
      }

      const afterController = new AbortController()
      const afterPromise = stage.execute(
        { simulationId },
        { signal: afterController.signal },
      )
      afterController.abort()
      const after = await afterPromise
      return {
        before,
        during,
        after,
        afterSignalAborted: afterController.signal.aborted,
      }
    })

    expect(cancellation.before).toMatchObject({ ok: false, tool: 'simulate_plan', error: { code: 'CANCELLED' } })
    expect(cancellation.during).toMatchObject({ ok: false, tool: 'simulate_plan', error: { code: 'CANCELLED' } })
    expect(cancellation.after).toMatchObject({
      ok: true,
      tool: 'stage_plan',
      state: { activeProposal: { status: 'staged' } },
    })
    expect(cancellation.afterSignalAborted).toBe(true)
    await expect(page.getByText(/Active proposal: Balanced Night, Staged for review/)).toBeVisible()
  })
})
