import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ProposalDesk from './ProposalDesk'
import { createStore } from '../state/store'

const runInAct = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
  let result!: T
  await act(async () => {
    result = await operation()
  })
  return result
}

const prepareReviewedStore = async () => {
  const appStore = createStore({ storage: null })
  const simulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
  if (!simulation.ok) throw new Error(simulation.error.message)
  const staged = await runInAct(() => appStore.agent.stagePlan(simulation.data.simulationId))
  if (!staged.ok) throw new Error(staged.error.message)
  const reviewed = await runInAct(() => appStore.agent.requestReview(staged.data.proposalId))
  if (!reviewed.ok) throw new Error(reviewed.error.message)
  return appStore
}

const renderDesk = async () => {
  const appStore = await prepareReviewedStore()
  render(
    <>
      <h2 id="comparison-heading" tabIndex={-1}>Comparison</h2>
      <ProposalDesk store={appStore} />
    </>,
  )
  return appStore
}

describe('ProposalDesk human commit checkpoint', () => {
  it('opens with safe Cancel focus, traps focus, closes on Escape and returns focus', async () => {
    await renderDesk()
    const invoker = screen.getByRole('button', { name: 'Review and commit' })
    fireEvent.click(invoker)
    const dialog = screen.getByRole('dialog', { name: /Review and commit Balanced Night/ })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))

    const close = screen.getByRole('button', { name: 'Close commit confirmation' })
    const confirm = screen.getByRole('button', { name: 'Confirm commit' })
    confirm.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    close.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(invoker))
  })

  it('cancels from the backdrop without changing the proposal', async () => {
    const appStore = await renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    const backdrop = document.querySelector('.modal-backdrop')
    if (!(backdrop instanceof HTMLElement)) throw new Error('Missing commit backdrop')
    fireEvent.mouseDown(backdrop)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(appStore.getSnapshot().activeProposal?.status).toBe('review-requested')
  })

  it('commits once from keyboard activation and returns a focused committed summary', async () => {
    const appStore = await renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    const confirm = screen.getByRole('button', { name: 'Confirm commit' })
    fireEvent.keyDown(confirm, { key: 'Enter' })
    fireEvent.click(confirm)
    await screen.findByText('Committed Balanced Night')
    expect(appStore.getSnapshot().committedPolicy.planId).toBe('balanced-night')
    expect(appStore.getSnapshot().journal.filter((entry) => entry.event === 'commit')).toHaveLength(1)
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Committed Balanced Night'))
  })

  it('clears the committed summary after undo', async () => {
    const appStore = await renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm commit' }))
    await screen.findByText('Committed Balanced Night')

    act(() => {
      appStore.human.undo()
    })
    await waitFor(() => expect(screen.queryByText('Committed Balanced Night')).not.toBeInTheDocument())
  })

  it('clears the committed summary after a session reset', async () => {
    const appStore = await renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm commit' }))
    await screen.findByText('Committed Balanced Night')

    act(() => {
      appStore.human.reset()
    })
    await waitFor(() => expect(screen.queryByText('Committed Balanced Night')).not.toBeInTheDocument())
  })

  it('clears the committed summary when a new proposal is staged', async () => {
    const appStore = await renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm commit' }))
    await screen.findByText('Committed Balanced Night')

    const simulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
    if (!simulation.ok) throw new Error(simulation.error.message)
    const staged = await runInAct(() => appStore.agent.stagePlan(simulation.data.simulationId))
    if (!staged.ok) throw new Error(staged.error.message)
    await waitFor(() => expect(screen.queryByText('Committed Balanced Night')).not.toBeInTheDocument())
  })

  it('closes the dialog when an external discard removes the proposal', async () => {
    const appStore = await prepareReviewedStore()
    const messages: string[] = []
    render(
      <>
        <h2 id="comparison-heading" tabIndex={-1}>Comparison</h2>
        <ProposalDesk store={appStore} onLiveMessage={(message) => messages.push(message)} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    const proposalId = appStore.getSnapshot().activeProposal?.proposalId
    if (proposalId === undefined) throw new Error('Expected an active proposal')

    act(() => {
      appStore.agent.discardPlan(proposalId)
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(messages.at(-1)).toMatch(/removed externally/))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Comparison' })))
  })

  it('closes the dialog when an external replacement changes the proposal', async () => {
    const appStore = await prepareReviewedStore()
    const messages: string[] = []
    render(
      <>
        <h2 id="comparison-heading" tabIndex={-1}>Comparison</h2>
        <ProposalDesk store={appStore} onLiveMessage={(message) => messages.push(message)} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    const proposalId = appStore.getSnapshot().activeProposal?.proposalId
    if (proposalId === undefined) throw new Error('Expected an active proposal')

    act(() => {
      appStore.human.refreshForecast()
    })
    const simulation = await runInAct(() => appStore.agent.simulatePlan('balanced-night'))
    if (!simulation.ok) throw new Error(simulation.error.message)
    const replacement = await runInAct(() => appStore.agent.stagePlan(simulation.data.simulationId, proposalId))
    if (!replacement.ok) throw new Error(replacement.error.message)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(appStore.getSnapshot().activeProposal?.proposalId).not.toBe(proposalId)
    expect(messages.at(-1)).toMatch(/changed externally/)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Comparison' })))
  })

  it('keeps the dialog open and disables commit when the proposal becomes stale', async () => {
    const appStore = await renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Review and commit' }))
    act(() => {
      appStore.human.refreshForecast()
    })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('STALE_PROPOSAL')
    expect(screen.getByRole('button', { name: 'Confirm commit' })).toBeDisabled()
    await waitFor(() => expect(document.activeElement).toBe(alert))
    expect(screen.getByRole('button', { name: 'Restage exact proposal' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard proposal' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(appStore.getSnapshot().activeProposal).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Comparison' })))
  })
})
