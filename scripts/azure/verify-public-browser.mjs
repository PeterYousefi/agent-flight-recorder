import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const base = process.env.AFR_PUBLIC_BASE_URL
assert.ok(base && /^https:\/\/agent-recorder-demo\.canadacentral\.cloudapp\.azure\.com$/.test(base))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const overviewResponse = await page.request.get(base + '/api/v1/overview')
  assert.ok(overviewResponse.ok(), 'Public overview API unavailable')
  const overview = await overviewResponse.json()
  assert.ok(overview.total > 0, 'Verified demo executions must exist')
  for (const path of ['/', '/demo-lab', '/observability', '/settings']) {
    const response = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 })
    assert.ok(response?.ok(), `Public browser route failed: ${path}`)
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 })
    const text = await page.locator('body').innerText()
    assert.match(text, /synthetic/i, 'Public demo disclosure must be visible')
    assert.doesNotMatch(
      text,
      /Failed to fetch|Unable to load|Something went wrong|API is unavailable/i,
    )
    process.stdout.write(`Public browser route: ${path} passed\n`)
  }
  assert.deepEqual(errors, [], 'Public frontend raised JavaScript errors')
  await page.goto(base + '/demo-lab', { waitUntil: 'networkidle' })
  await mkdir('/private/tmp/afr-azure-browser', { recursive: true })
  await page.screenshot({ path: '/private/tmp/afr-azure-browser/demo.png', fullPage: false })
} finally {
  await browser.close()
}
