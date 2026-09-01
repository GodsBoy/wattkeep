import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App'
import { createStore } from './state/store'

const renderApp = () => {
  const appStore = createStore({ storage: null })
  render(<App store={appStore} webMcpTarget={null} />)
  return appStore
}

const runDefaultComparison = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Run comparison' }))
  await screen.findByRole('heading', { name: 'Essential Reserve' })
}

const runInAct = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
  let result!: T
  await act(async () => {
    result = await operation()
  })
  return result
}

describe('WattKeep manual control room', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the baseline household and the manual WebMCP fallback', async () => {
    renderApp()

    expect(screen.getByText('The Morgan household')).toBeInTheDocument()
    expect(screen.getByText('10.53 kWh')).toBeInTheDocument()
    expect(screen.getByText('78.0% of 13.50 kWh total capacity')).toBeInTheDocument()
    expect(screen.getByText('2.70 kWh')).toBeInTheDocument()
    expect(screen.getByText('18:00 to 06:00')).toBeInTheDocument()
    expect(screen.getByText('No active proposal. Simulate a plan to begin.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/WebMCP is unavailable/i)).toBeInTheDocument())
    expect(screen.getByText('Manual interface active')).toBeInTheDocument()
  })

  it('keeps all three presets selected, validates the count, and mirrors the domain ranking', async () => {
    renderApp()

    expect(screen.getByRole('checkbox', { name: 'Compare Essential Reserve' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Compare Balanced Night' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Compare Comfort Carry' })).toBeChecked()

    await runDefaultComparison()

    const cards = screen.getByRole('region', { name: 'Ranked plan results' })
    const headings = within(cards).getAllByRole('heading', { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Essential Reserve',
      'Balanced Night',
      'Comfort Carry',
    ])
    expect(within(cards).getByText('8.09 kWh', { exact: true })).toBeInTheDocument()
    expect(within(cards).getByText('6.97 kWh', { exact: true })).toBeInTheDocument()
    expect(within(cards).getByText('0.67 kWh', { exact: true })).toBeInTheDocument()
    expect(within(cards).getByText('First reserve breach: 02:00 to 03:00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Essential Reserve' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Balanced Night' }))
    expect(screen.getByText('Choose exactly 2 or 3 plans before running a comparison.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run comparison' })).toBeDisabled()
  })

  it('updates the named candidate matrix and explains a selected interval', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('radio', { name: 'Use Comfort Carry as candidate' }))
    expect(screen.getByRole('columnheader', { name: /Selected candidateComfort Carry/i })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Water heater/ })).toHaveTextContent('On')

    await runDefaultComparison()
    fireEvent.click(screen.getByRole('button', { name: 'Explain 02:00 to 03:00' }))
    await screen.findByText(/From 02:00 to 03:00/)
    expect(screen.getByText(/below the 2.70 kWh reserve/i)).toBeInTheDocument()
  })

  it('syncs tool-driven stage, review, discard, refresh conflict, commit and undo changes', async () => {
    const appStore = renderApp()
    const simulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
    if (!simulation.ok) throw new Error(simulation.error.message)
    const staged = await runInAct(() => appStore.agent.stagePlan(simulation.data.simulationId))
    if (!staged.ok) throw new Error(staged.error.message)
    expect(await screen.findByText(/Active proposal:/)).toBeInTheDocument()
    expect(screen.getByText('Request review')).toBeInTheDocument()

    const reviewed = await runInAct(() => appStore.agent.requestReview(staged.data.proposalId))
    expect(reviewed.ok).toBe(true)
    await screen.findByRole('button', { name: 'Review and commit' })

    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    expect(screen.getByRole('dialog', { name: /Review and commit Balanced Night/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm commit' }))
    await screen.findByText(/Committed Balanced Night/)
    expect(appStore.getSnapshot().activeProposal).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Undo latest change' }))
    await waitFor(() => expect(appStore.getSnapshot().committedPolicy.planId).toBe('essential-reserve'))

    const secondSimulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
    if (!secondSimulation.ok) throw new Error(secondSimulation.error.message)
    const secondStage = await runInAct(() => appStore.agent.stagePlan(secondSimulation.data.simulationId))
    if (!secondStage.ok) throw new Error(secondStage.error.message)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh forecast' }))
    await screen.findByText(/active proposal is now stale/i)
    expect(screen.getByText(/Stale proposal/)).toBeInTheDocument()
    expect(screen.getByText(/stale because the workspace revision changed/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Discard proposal' }))
    await waitFor(() => expect(appStore.getSnapshot().activeProposal).toBeNull())
  })

  it('restages the stale proposal plan even when a different candidate is selected', async () => {
    const appStore = renderApp()
    const simulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
    if (!simulation.ok) throw new Error(simulation.error.message)
    const staged = await runInAct(() => appStore.agent.stagePlan(simulation.data.simulationId))
    if (!staged.ok) throw new Error(staged.error.message)

    fireEvent.click(screen.getByRole('radio', { name: 'Use Essential Reserve as candidate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh forecast' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restage exact proposal' }))

    await waitFor(() => expect(appStore.getSnapshot().activeProposal?.status).toBe('staged'))
    expect(appStore.getSnapshot().activeProposal?.planId).toBe('balanced-night')
  })

  it('requires confirmation before archiving the current session', async () => {
    const appStore = renderApp()
    const simulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
    if (!simulation.ok) throw new Error(simulation.error.message)
    const staged = await runInAct(() => appStore.agent.stagePlan(simulation.data.simulationId))
    if (!staged.ok) throw new Error(staged.error.message)

    fireEvent.click(screen.getByRole('button', { name: 'Reset session' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset WattKeep planning?' })
    expect(dialog).toHaveTextContent('Balanced Night')
    expect(dialog).toHaveTextContent('archived')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Reset session' }))
    fireEvent.click(cancel)
    expect(appStore.getSnapshot().activeProposal).not.toBeNull()
    expect(screen.getByText('Reset cancelled. Current session unchanged.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset session' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset session' }).at(-1) as HTMLElement)
    await waitFor(() => expect(appStore.getSnapshot().activeProposal).toBeNull())
    expect(appStore.getSnapshot().archivedSessions).toHaveLength(1)
  })
})
