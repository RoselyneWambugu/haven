// A wide window opens on the landing page, and its buttons reach registration and sign-in.
// Usage: node e2e/flow-landing.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8101)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 240)}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
const tid = (id) => page.locator(`[data-testid="${id}"]`)
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); await shot(`FAIL-${name}`); console.log(problems.join('\n')); throw e } }
const body = async () => page.locator('body').innerText()
const BASE = 'http://localhost:8101'
await page.goto(`${BASE}/`)
await page.waitForTimeout(1500)
await step('wide-window-opens-the-landing-page', async () => {
  await tid('landing').waitFor()
  await shot('150-landing')
  const t = await body()
  for (const w of ['A space to speak.', 'Someone to listen.', 'Your pace, your people', 'Peer chat']) if (!t.includes(w)) throw new Error('missing: ' + w)
})
await step('download-the-app', async () => {
  await tid('download-app').first().click()
  await page.waitForURL('**/mobile-app')
  await tid('mobile-app').waitFor()
  await shot('150b-download')
  if ((await tid('app-not-yet').count()) !== 1) throw new Error('expected the not-yet note while no store addresses are set')
  await page.goto(`${BASE}/`)
  await tid('landing').waitFor()
})
await step('check-in-answers-kindly', async () => {
  await tid('mood-1').click()
  await tid('checkin-reply').waitFor()
  if (!(await body()).includes('Someone here will listen')) throw new Error('no kind reply')
  await shot('151-checkin')
})
await step('get-started-goes-to-registration', async () => {
  await tid('landing-start').click()
  await tid('consent').waitFor()
})
await step('sign-in-goes-to-login', async () => {
  await page.goto(`${BASE}/`)
  await tid('landing').waitFor()
  await tid('landing-signin').click()
  await page.waitForURL('**/login')
})
await step('the-landing-page-has-no-urgent-help-button', async () => {
  await page.goto(`${BASE}/`)
  await tid('landing').waitFor()
  if ((await tid('footer-urgent').count()) !== 0) throw new Error('footer urgent help is still there')
  if ((await page.getByRole('button', { name: 'Urgent help' }).count()) !== 0) throw new Error('an Urgent help button is still on the landing page')
})
await step('therapist-and-staff-links', async () => {
  await page.goto(`${BASE}/`)
  await tid('landing').waitFor()
  await tid('therapist-link').click()
  await page.waitForURL('**/portal/sign-in')
  await page.goto(`${BASE}/`)
  await tid('landing').waitFor()
  await tid('staff-link').click()
  await page.waitForURL('**/staff/sign-in')
  // the old address still works
  await page.goto(`${BASE}/admin/sign-in`)
  await page.waitForURL('**/staff/sign-in')
  await page.goto(`${BASE}/admin`)
  await page.waitForURL('**/staff/sign-in')
})
await step('a-narrow-window-keeps-the-welcome-screen', async () => {
  await page.goto(`${BASE}/`)
  await tid('landing').waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/`)
  await tid('welcome').waitFor()
  await shot('152-narrow-welcome')
})
await browser.close()
server.close()
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1) }
console.log('all steps passed')
