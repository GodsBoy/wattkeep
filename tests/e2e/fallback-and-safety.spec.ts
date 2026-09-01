import { expect, test } from '@playwright/test'

import { fakeModelContextInitScript } from '../support/fake-model-context'

const openManualApp = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Make stored energy last.' })).toBeVisible()
  await expect(page.getByText('Manual interface active')).toBeVisible()
}

const runComparison = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: 'Run comparison' }).click()
  await expect(page.getByRole('region', { name: 'Ranked plan results' })).toBeVisible()
}

const stageAndReview = async (page: import('@playwright/test').Page): Promise<void> => {
  await runComparison(page)
  await page.getByRole('button', { name: 'Stage selected plan' }).click()
  await expect(page.getByText(/Active proposal: Balanced Night, Staged for review/)).toBeVisible()
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page.getByRole('button', { name: 'Review and commit' })).toBeVisible()
}

test.describe('manual fallback and safety paths', () => {
  test('completes a keyboard human commit, rejects stale confirmation, restages by ID, and discards', async ({ page }) => {
    await openManualApp(page)
    await stageAndReview(page)

    await page.getByRole('button', { name: 'Review and commit' }).click()
    const confirm = page.getByRole('button', { name: 'Confirm commit' })
    await confirm.press('Enter')
    await expect(page.getByText('Committed Balanced Night')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo latest change' })).toBeEnabled()

    await stageAndReview(page)
    await page.getByRole('button', { name: 'Review and commit' }).click()
    await expect(page.getByRole('dialog', { name: /Review and commit Balanced Night/ })).toBeVisible()

    // The visible modal is intentionally kept open while the underlying human
    // action changes the revision, which exercises the stale checkpoint.
    await page.evaluate(() => {
      const refresh = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Refresh forecast'))
      if (!(refresh instanceof HTMLButtonElement)) {
        throw new Error('Missing refresh forecast control')
      }
      refresh.click()
    })
    const staleAlert = page.getByRole('alert')
    await expect(staleAlert).toContainText('STALE_PROPOSAL')
    await expect(page.getByRole('button', { name: 'Confirm commit' })).toBeDisabled()
    await expect(staleAlert).toContainText('The workspace changed while this confirmation was open')

    await page.getByRole('button', { name: 'Restage exact proposal' }).click()
    await expect(page.getByText(/Active proposal: Balanced Night, Staged for review/)).toBeVisible()
    await page.getByRole('button', { name: 'Request review' }).click()
    await expect(page.getByRole('button', { name: 'Review and commit' })).toBeVisible()

    await page.getByRole('button', { name: 'Discard proposal' }).click()
    await expect(page.getByText('No active proposal. Simulate a plan to begin.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review and commit' })).not.toBeVisible()
  })

  test('requires a reset confirmation, supports cancellation, and archives the current session', async ({ page }) => {
    await openManualApp(page)
    await stageAndReview(page)

    await page.getByRole('button', { name: 'Reset session' }).click()
    const dialog = page.getByRole('dialog', { name: 'Reset WattKeep planning?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Reset cancelled. Current session unchanged.')).toBeVisible()
    await expect(page.getByText(/Active proposal: Balanced Night, Review requested/)).toBeVisible()

    await page.getByRole('button', { name: 'Reset session' }).click()
    await dialog.getByRole('button', { name: 'Reset session' }).click()
    await expect(page.getByText(/Session reset complete\. Session 2 starts at revision 1/)).toBeVisible()
    await expect(page.getByText('No active proposal. Simulate a plan to begin.')).toBeVisible()
    await expect(page.getByText('1 archived session.')).toBeVisible()
    await expect(page.locator('.journal-session')).toHaveText('Session 2')
  })

  test('falls back visibly when registration fails after a partial tool set', async ({ page }) => {
    await page.addInitScript({ content: fakeModelContextInitScript({ failAfter: 3 }) })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Make stored energy last.' })).toBeVisible()
    await expect(page.getByText('Manual interface active')).toBeVisible()
    await expect(page.getByText('WebMCP registration failed; use the manual interface.')).toBeVisible()

    const registrationState = await page.evaluate(() => {
      const state = (globalThis as typeof globalThis & {
        __wattkeepFakeModelContext?: {
          readonly tools: Record<string, unknown>
          readonly registrations: readonly unknown[]
        }
      }).__wattkeepFakeModelContext
      return {
        activeTools: Object.keys(state?.tools ?? {}),
        registrationCount: state?.registrations.length ?? 0,
      }
    })
    expect(registrationState.registrationCount).toBeGreaterThan(0)
    expect(registrationState.registrationCount).toBeLessThan(8)
    expect(registrationState.activeTools).toEqual([])
  })

  test('degrades to memory-only persistence while still committing the policy', async ({ page }) => {
    await page.addInitScript({ content: `(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'wattkeep:state:v1') {
          throw new Error('Deterministic storage failure');
        }
        return originalSetItem.call(this, key, value);
      };
    })()` })
    await openManualApp(page)
    await stageAndReview(page)

    await expect(page.getByText('Memory only')).toBeVisible()
    await page.getByRole('button', { name: 'Review and commit' }).click()
    await page.getByRole('button', { name: 'Confirm commit' }).click()
    await expect(page.getByText('Committed Balanced Night')).toBeVisible()
    await expect(page.getByText(/Memory-only session: the commit is successful in this session/)).toBeVisible()
    await expect(page.getByText('Memory only')).toBeVisible()
  })
})
