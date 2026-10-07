import { test, expect } from '@playwright/test'
test('real persisted overview and all console pages render', async ({ page, request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/overview')
  expect(response.ok()).toBe(true)
  const overview = await response.json()
  expect(overview.total).toBeGreaterThan(0)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByText(String(overview.total), { exact: true }).first()).toBeVisible()
  for (const [path, title] of [
    ['/executions', 'Executions'],
    ['/dead-letter', 'Dead Letter'],
    ['/demo-lab', 'Demo Lab'],
    ['/observability', 'Observability'],
    ['/settings', 'Settings'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByText('The local API is unavailable.', { exact: false })).toHaveCount(0)
  }
  await page.goto('/')
  await page.screenshot({ path: '../../docs/screenshots/overview.png', fullPage: true })
  expect(errors).toEqual([])
})
