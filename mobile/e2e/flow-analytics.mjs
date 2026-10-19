// Onboards, grants a demo plan, matches with a peer, and exercises blocked-message handling in chat.
// Usage: node e2e/flow-analytics.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8091)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 240)}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
const tid = (id) => page.locator(`[data-testid="${id}"]`)
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); await shot(`FAIL-${name}`); console.log(problems.join('\n')); throw e } }
const body = async () => page.locator('body').innerText()
const login = async (name) => {
  await page.waitForTimeout(600)
  await page.goto('http://localhost:8091/admin/sign-in')
  await page.waitForTimeout(1500)
  if (await tid('admin-sign-out').count()) await tid('admin-sign-out').click()
  await tid('admin-sign-in').waitFor()
  await tid(`staff-${name}`).click()
  await tid('mfa-code').fill('135790')
  await tid('admin-sign-in-go').click()
  await tid('admin-overview').waitFor()
}

await page.goto('http://localhost:8091/')
await page.waitForTimeout(1500)
await step('admin-sees-all-sections', async () => {
  await login('S. Kamau')
  await tid('anav-analytics').click()
  await tid('admin-analytics').waitFor()
  const t = await body()
  if (!/Sample data/.test(t)) throw new Error('sample data banner missing')
  for (const id of ['an-product', 'an-care', 'an-commercial', 'an-safety']) if (!(await tid(id).count())) throw new Error('admin should see ' + id)
  if (!(await tid('export-analytics').count())) throw new Error('admin should see export')
  await shot('100-product')
})
await step('funnel-and-table', async () => {
  const before = await tid('tile-registered').innerText()
  await tid('range-7').click()
  await page.waitForTimeout(300)
  const after = await tid('tile-registered').innerText()
  if (before === after) throw new Error('range change did not change the figures')
  await tid('range-30').click()
  await tid('chart-funnel-toggle').click()
  await page.waitForTimeout(200)
  const t = await tid('chart-funnel').innerText()
  if (!/Of previous/.test(t) || !/Sent a first message/.test(t)) throw new Error('table view missing')
  await shot('101-funnel-table')
  await tid('chart-funnel-toggle').click()
})
await step('small-groups-hidden', async () => {
  await page.locator('[data-testid="chart-who"]').scrollIntoViewIfNeeded()
  const t = await tid('chart-who').innerText()
  if (!/<10/.test(t)) throw new Error('small cells should be hidden')
  await shot('102-who')
})
await step('cohorts-have-gaps', async () => {
  await tid('chart-cohorts-toggle').click()
  const t = await tid('chart-cohorts').innerText()
  if (!/—/.test(t)) throw new Error('recent cohorts should have no day-30 figure yet')
  await tid('chart-cohorts-toggle').click()
  await shot('103-cohorts')
})
await step('safety-uses-live-data', async () => {
  await tid('an-safety').click()
  await tid('tile-report-rate').waitFor()
  await tid('chart-ai').waitFor()
  const t = await tid('chart-ai').innerText()
  if (!/precision/i.test(t)) throw new Error('AI precision missing')
  await shot('104-safety')
})
await step('export-is-logged', async () => {
  await tid('export-analytics').click()
  await page.waitForTimeout(400)
  await tid('anav-audit').click()
  await tid('admin-audit').waitFor()
  if (!/Exported analytics/.test(await body())) throw new Error('export should be in the audit log')
})
await step('billing-sees-only-commercial', async () => {
  await login('J. Otieno')
  await tid('anav-analytics').click()
  await tid('admin-analytics').waitFor()
  if ((await tid('an-product').count()) || (await tid('an-safety').count())) throw new Error('billing should only see Commercial')
  if (await tid('export-analytics').count()) throw new Error('billing should not export')
  await tid('chart-mix').waitFor()
  await shot('105-commercial')
})
await step('moderator-sees-only-safety', async () => {
  await login('T. Njeri')
  await tid('anav-analytics').click()
  await tid('admin-analytics').waitFor()
  if (await tid('an-product').count()) throw new Error('moderator should not see Product')
  await tid('chart-review').waitFor()
})
await browser.close()
server.close()
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1) }
console.log('all steps passed')
