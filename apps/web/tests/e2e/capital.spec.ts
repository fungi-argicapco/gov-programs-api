import { test, expect } from '@playwright/test'
import { getMockProgramsResponse } from '../../src/lib/api/programs.mock'

test.describe('Capital Finder', () => {
  test('renders results with mocked programs', async ({ page }) => {
    const mockResponse = getMockProgramsResponse()

    await page.route('**/v1/programs**', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockResponse)
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/capital')

    await expect(page.getByRole('heading', { level: 1, name: 'Capital Finder' })).toBeVisible()

    await expect(page.getByText('Industrial Decarbonization Upgrade')).toBeVisible()
    await expect(page.getByText('Green Housing Acceleration')).toBeVisible()

    await expect(page.getByText('energy.gov')).toBeVisible()
    await expect(page.getByText('infrastructure.ca')).toBeVisible()

    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeEnabled()
  })
})
