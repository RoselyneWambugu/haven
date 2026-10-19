// A note sent from Settings reaches the admin Feedback module, and only the right roles can open it.
// Usage: node e2e/flow-feedback.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8100)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 240)}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
const tid = (id) => page.locator(`[data-testid="${id}"]`)
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); await shot(`FAIL-${name}`); console.log(problems.join('\n')); throw e } }
const body = async () => page.locator('body').innerText()
const BASE = 'http://localhost:8100'
const login = async (name) => {
  await page.waitForTimeout(700)
  await page.goto(`${BASE}/admin/sign-in`)
  await page.waitForTimeout(1500)
  if (await tid('admin-sign-out').count()) await tid('admin-sign-out').click()
  await tid('admin-sign-in').waitFor()
  await tid(`staff-${name}`).click()
  await tid('mfa-code').fill('135790')
  await tid('admin-sign-in-go').click()
  await page.waitForTimeout(500)
}

await page.goto(`${BASE}/`)
await page.waitForTimeout(1200)
await step('a-note-sent-in-the-app-appears-for-support', async () => {
  await page.evaluate(() => window.__echo.feedback.send('bug', 'The chat froze when I sent two messages', true))
  await login('J. Otieno')
  await tid('anav-feedback').click()
  await tid('admin-feedback').waitFor()
  await shot('140-feedback')
  const t = await body()
  for (const w of ['The chat froze when I sent two messages', 'Not enough answers yet', 'Notes to read']) if (!t.includes(w)) throw new Error('missing: ' + w)
})
await step('marking-a-note-as-read-is-logged', async () => {
  await tid('fb-read').click()
  await page.getByText('Read by J. Otieno').waitFor()
  await login('S. Kamau')
  await tid('anav-audit').click()
  await tid('admin-audit').waitFor()
  if (!(await body()).includes('Marked feedback as read')) throw new Error('not in the audit log')
})
await step('moderators-do-not-see-feedback', async () => {
  await login('T. Njeri')
  if (await tid('anav-feedback').count()) throw new Error('a moderator should not see Feedback')
})
await browser.close()
server.close()
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1) }
console.log('all steps passed')
