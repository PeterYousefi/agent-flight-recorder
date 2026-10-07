import { test, expect } from '@playwright/test'
test('Demo Lab transient retry renders persisted timeline, graph, artifacts and trace', async ({
  page,
  request,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/demo-lab')
  const card = page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Transient Failure', exact: true }) })
  await card.getByRole('button', { name: 'Run Demo' }).click()
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').at(-1)
  await expect(page.getByRole('button', { name: 'Execution succeeded', exact: false })).toBeVisible(
    { timeout: 30000 },
  )
  await expect(page.getByText('Attempt 2', { exact: true })).toBeVisible()
  const before = await (
    await request.get(`http://127.0.0.1:3000/api/v1/executions/${id}/events?limit=100`)
  ).json()
  expect(before.items.filter((event) => event.event_type === 'execution.started')).toHaveLength(2)
  await page.screenshot({ path: '../../docs/screenshots/flight-recorder.png', fullPage: true })
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Inspect Retry scheduled' })).toBeVisible()
  await expect(page.locator('path[stroke-dasharray="4 3"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Inspect Provider call failed' }).click()
  await expect(page.getByText('toolInvocationId', { exact: true })).toBeVisible()
  await page.screenshot({ path: '../../docs/screenshots/execution-graph.png', fullPage: true })
  await page.getByRole('tab', { name: 'Artifacts', exact: true }).click()
  await page.getByRole('button', { name: 'Read private artifact' }).click()
  await expect(page.getByText('content', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Trace', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Open trace in Grafana' })).toHaveAttribute(
    'href',
    /tempo/,
  )
  await page.getByRole('button', { name: 'Replay simulation', exact: true }).click()
  await expect(page).not.toHaveURL(new RegExp(`${id}$`))
  await expect(page.getByText('simulation replay of', { exact: false })).toBeVisible()
  const after = await (
    await request.get(`http://127.0.0.1:3000/api/v1/executions/${id}/events?limit=100`)
  ).json()
  expect(after.items).toEqual(before.items)
  expect(errors).toEqual([])
})
test('cancellation and Replay Demo actions navigate to valid new state', async ({ page }) => {
  await page.goto('/demo-lab')
  await page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Cancellation', exact: true }) })
    .getByRole('button', { name: 'Run Demo' })
    .click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Execution cancelled', exact: false }),
  ).toBeVisible()
  await page.goto('/demo-lab')
  await page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Replay', exact: true }) })
    .getByRole('button', { name: 'Run Demo' })
    .click()
  await expect(page.getByText('simulation replay of', { exact: false })).toBeVisible({
    timeout: 30000,
  })
})
