import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ProposalDesk from './ProposalDesk'
import { createStore } from '../state/store'

const prepareReviewedStore = async () => {
  const appStore = createStore({ storage: null })
  const runInAct = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
    let result!: T
    await act(async () => {
      result = await operation()
    })
    return result
  }
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

    screen.getByRole('button', { name: 'Close commit confirmation' }).focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm commit' }))
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
