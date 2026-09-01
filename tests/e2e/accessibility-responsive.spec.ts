import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const openManualApp = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Make stored energy last.' })).toBeVisible()
  await expect(page.getByText('Manual interface active')).toBeVisible()
}

const runComparison = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Run comparison' }).click()
  await expect(page.getByRole('region', { name: 'Ranked plan results' })).toBeVisible()
}

const stageAndReview = async (page: Page): Promise<void> => {
  await runComparison(page)
  await page.getByRole('button', { name: 'Stage selected plan' }).click()
  await expect(page.getByText(/Active proposal: Balanced Night, Staged for review/)).toBeVisible()
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page.getByRole('button', { name: 'Review and commit' })).toBeVisible()
}

const checkSeriousAccessibility = async (page: Page, state: string): Promise<void> => {
  const result = await new AxeBuilder({ page }).analyze()
  const seriousViolations = result.violations.filter((violation) => (
    violation.impact === 'serious' || violation.impact === 'critical'
  ))
  expect(seriousViolations, `${state} accessibility violations`).toEqual([])
}

test.describe('accessibility and human checkpoint focus', () => {
  test('has no serious or critical violations across the planning states', async ({ page }) => {
    await openManualApp(page)
    await checkSeriousAccessibility(page, 'baseline')

    await runComparison(page)
    await checkSeriousAccessibility(page, 'comparison')

    await page.getByRole('button', { name: 'Stage selected plan' }).click()
    await page.getByRole('button', { name: 'Request review' }).click()
    await expect(page.getByRole('button', { name: 'Review and commit' })).toBeVisible()
    await checkSeriousAccessibility(page, 'proposal')

    await page.getByRole('button', { name: 'Review and commit' }).click()
    await expect(page.getByRole('dialog', { name: /Review and commit Balanced Night/ })).toBeVisible()
    await checkSeriousAccessibility(page, 'commit dialog')

    await page.evaluate(() => {
      const refresh = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Refresh forecast'))
      if (!(refresh instanceof HTMLButtonElement)) {
        throw new Error('Missing refresh forecast control')
      }
      refresh.click()
    })
    await expect(page.getByRole('alert')).toContainText('STALE_PROPOSAL')
    await checkSeriousAccessibility(page, 'stale alert')

    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Restage exact proposal' }).click()
    await expect(page.getByText(/Active proposal: Balanced Night, Staged for review/)).toBeVisible()
    await page.getByRole('button', { name: 'Request review' }).click()
    await page.getByRole('button', { name: 'Review and commit' }).click()
    await page.getByRole('button', { name: 'Confirm commit' }).click()
    await expect(page.getByText('Committed Balanced Night')).toBeVisible()
    await checkSeriousAccessibility(page, 'committed summary')
  })

  test('keeps commit focus safe, traps the dialog, supports Escape and backdrop cancellation, and focuses the outcome', async ({ page }) => {
    await openManualApp(page)
    await stageAndReview(page)

    const invoker = page.getByRole('button', { name: 'Review and commit' })
    await invoker.click()
    const dialog = page.getByRole('dialog', { name: /Review and commit Balanced Night/ })
    const cancel = dialog.getByRole('button', { name: 'Cancel' })
    const confirm = dialog.getByRole('button', { name: 'Confirm commit' })
    await expect(cancel).toBeFocused()

    await dialog.getByRole('button', { name: 'Close commit confirmation' }).focus()
    await page.keyboard.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(invoker).toBeFocused()

    await invoker.click()
    await page.locator('.modal-backdrop').click({ position: { x: 1, y: 1 } })
    await expect(dialog).not.toBeVisible()
    await expect(invoker).toBeFocused()

    await invoker.click()
    await confirm.press('Enter')
    const summary = page.getByText('Committed Balanced Night')
    await expect(summary).toBeVisible()
    await expect(page.locator('.commit-summary')).toBeFocused()
  })
})

test.describe('responsive planning control room', () => {
  for (const width of [390, 768, 1440]) {
    test(`keeps essential controls reachable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openManualApp(page)

      await expect.poll(() => page.evaluate(() => (
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth
      ))).toBe(false)

      for (const name of ['Run comparison', 'Stage selected plan', 'Refresh forecast', 'Reset session']) {
        const control = page.getByRole('button', { name })
        await expect(control).toBeVisible()
        await control.scrollIntoViewIfNeeded()
        expect(await control.boundingBox()).not.toBeNull()
      }
    })
  }

  test('passes an explicit 320 CSS-pixel layout check for 400% zoom conditions', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await openManualApp(page)

    await expect.poll(() => page.evaluate(() => (
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth
    ))).toBe(false)
    await expect(page.getByRole('heading', { name: 'Energy status' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Run comparison' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh forecast' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset session' })).toBeVisible()
  })
})

test('boots through a direct production-preview navigation with expected assets and no page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  const errorResponses: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errorResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Make stored energy last.' })).toBeVisible()
  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(1)
  await expect(page.locator('script[type="module"]')).toHaveCount(1)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
  expect(failedRequests).toEqual([])
  expect(errorResponses).toEqual([])
})
