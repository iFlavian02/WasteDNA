import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin = process.env.WASTEDNA_FRONTEND_URL

test('browser shell connects the inventory, simulates 30 days, visits every module and survives refresh', { skip: !origin, timeout: 180_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    const apiRequests = []
    page.on('request', request => {
      if (request.url().includes('/api/')) apiRequests.push(request.url())
    })
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    // The shell connects to the (simulated) inventory without any click.
    await page.getByRole('heading', { name: 'Dashboard', level: 1 }).or(page.getByRole('alert')).first().waitFor({ timeout: 60_000 })
    const connectError = await page.getByRole('alert').count() ? await page.getByRole('alert').textContent() : null
    assert.equal(connectError, null, `inventory connection failed: ${connectError}`)
    const selected = await page.evaluate(() => localStorage.getItem('wastedna-dataset'))
    assert.match(selected, /"source":"inventory"/, 'connected dataset is persisted')
    const throughBefore = await page.getByText(/data through/).first().textContent()
    await page.goto(new URL('/business/data', origin).href, { waitUntil: 'domcontentloaded' })
    const simulate = page.getByRole('button', { name: 'Simulate 30 days' })
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Simulate 30 days') && !button.disabled), null, { timeout: 120_000 })
    await simulate.click()
    await page.goto(new URL('/business', origin).href, { waitUntil: 'domcontentloaded' })
    await page.getByText(/per day vs/).first().waitFor({ timeout: 60_000 })
    assert.notEqual(await page.getByText(/data through/).first().textContent(), throughBefore, 'simulating moves the data forward')

    for (const [path, heading] of [
      ['/business/actions/actions', 'Recommended actions'],
      ['/business/actions/simulator', 'What-if simulator'],
      ['/business/actions/report', 'WasteDNA report'],
      ['/business/deals', 'Deals'],
      ['/map', 'Good food is closer than you think'],
    ]) {
      await page.goto(new URL(path, origin).href, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: heading }).waitFor({ timeout: 120_000 })
      if (path === '/business/actions/report') {
        await page.emulateMedia({ media: 'print' })
        assert.equal(await page.locator('.we-sidebar').evaluate(node => getComputedStyle(node).display), 'none')
        await page.emulateMedia({ media: 'screen' })
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Good food is closer than you think' }).waitFor()
    await page.goto(new URL('/summary', origin).href, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Dashboard', level: 1 }).waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('wastedna-dataset')), selected)
    assert.ok(apiRequests.some(url => url.startsWith(process.env.WASTEDNA_API_URL || 'https://wastedna.onrender.com')))
  } finally {
    await browser.close()
  }
})
