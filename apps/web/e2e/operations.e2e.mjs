import { test, expect } from '@playwright/test'
const api = 'http://127.0.0.1:3000/api/v1'
test('dead-letter replay and requeue preserve original history', async ({ page, request }) => {
  const created = await (await request.post(`${api}/demo/scenarios/permanent_failure/run`)).json()
  await expect
    .poll(
      async () => (await (await request.get(`${api}/executions/${created.id}`)).json()).status,
      { timeout: 30000 },
    )
    .toBe('DEAD_LETTERED')
  const original = await (
    await request.get(`${api}/executions/${created.id}/events?limit=100`)
  ).json()
  await page.goto('/dead-letter')
  const row = page.getByTestId(`dead-letter-${created.id}`)
  await row.getByRole('button', { name: 'Replay simulation' }).click()
  await expect(page.getByText('simulation replay of', { exact: false })).toBeVisible()
  await page.goto('/dead-letter')
  await row.getByRole('button', { name: 'Requeue', exact: true }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]{36}$/)
  expect(page.url()).not.toContain(created.id)
  expect(
    await (await request.get(`${api}/executions/${created.id}/events?limit=100`)).json(),
  ).toEqual(original)
})
test('settings, keyboard palette and responsive navigation remain usable', async ({
  page,
  request,
}) => {
  const settings = await (await request.get(`${api}/settings`)).json()
  expect(settings.azure_deployment_enabled).toBe(false)
  expect(settings.providers.find((p) => p.name === 'sapiom').configured).toBe(false)
  expect(JSON.stringify(settings)).not.toMatch(/api_key|connection_string|password/i)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Azure deployment disabled' })).toBeVisible()
  const search = page.getByRole('button', { name: /Search or jump to/ })
  await search.click()
  const input = page.getByPlaceholder('Search recent executions or pages…')
  await expect(input).toBeFocused()
  await input.fill('Demo Lab')
  await input.press('Enter')
  await expect(page.getByRole('heading', { name: 'Demo Lab', exact: true })).toBeVisible()
  await search.click()
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(search).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/demo-lab')
  await expect(page.getByRole('link', { name: 'Executions', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: '../../docs/screenshots/mobile-demo-lab.png', fullPage: true })
})
