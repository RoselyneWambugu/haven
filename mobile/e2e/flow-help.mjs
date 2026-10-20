// Onboards, grants a demo plan, matches with a peer, and exercises blocked-message handling in chat.
// Usage: node e2e/flow-help.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8095)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 240)}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
const tid = (id) => page.locator(`[data-testid="${id}"]`)
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); await shot(`FAIL-${name}`); console.log(problems.join('\n')); throw e } }
await page.goto('http://localhost:8095/')
await page.waitForTimeout(1800)
await step('urgent-signed-out', async () => {
  await tid('welcome').waitFor()
  await page.getByRole('button', { name: 'Urgent help' }).first().click()
  await tid('urgent').waitFor()
  await shot('40-urgent')
  await tid('breathe').click()
  await page.waitForTimeout(500)
  await shot('41-breathe')
  await page.getByRole('button', { name: 'Back' }).click()
})
await step('register', async () => {
  await tid('get-started').click()
  for (const id of ['consent-terms', 'consent-privacy', 'consent-guidelines', 'consent-screening']) await tid(id).click()
  await tid('consent-continue').click()
  await tid('reg-name').fill('Amina Otieno')
  await tid('reg-phone').fill('0712 345 678')
  await tid('reg-dob').fill('14/03/1998')
  await tid('register-continue').click()
  const code = (await tid('demo-code').innerText()).match(/(\d{6})/)[1]
  await tid('otp-input').fill(code)
  await tid('pen-input').fill('BrightFern')
  await tid('pen-continue').click()
  await tid('finish').click()
  await tid('home').waitFor()
})
await step('help-search-and-article', async () => {
  await tid('tab-help').click()
  await tid('help').waitFor()
  await shot('42-help')
  await tid('help-search').fill('refund')
  await tid('result-refunds').click()
  await tid('help-article').waitFor()
  await shot('43-article')
  await tid('helpful-yes').click()
  await page.getByRole('button', { name: 'Back' }).click()
})
await step('ticket-with-distress', async () => {
  await tid('help-search').fill('')
  await tid('help-contact').click()
  await tid('ticket-subject').fill('I cannot cope')
  await tid('ticket-text').fill('I want to end my life and nothing is helping me anymore')
  await page.waitForTimeout(200)
  await shot('44-contact-distress')
  await tid('ticket-send').click()
  await tid('ticket-thread').waitFor()
  await page.waitForTimeout(3600)
  await shot('45-ticket')
  const body = await page.locator('body').innerText()
  if (!/Urgent help is open now/.test(body)) throw new Error('crisis banner missing')
})
await browser.close()
server.close()
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1) }
console.log('all steps passed')
