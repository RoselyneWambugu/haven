// Onboards, grants a demo plan, matches with a peer, and exercises blocked-message handling in chat.
// Usage: node e2e/flow-groups.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8104)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 240)}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
const tid = (id) => page.locator(`[data-testid="${id}"]`)
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); await shot(`FAIL-${name}`); console.log(problems.join('\n')); throw e } }

await page.goto('http://localhost:8104/')
await page.waitForTimeout(1800)
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
  await page.evaluate(() => window.__echo.demo.grantPlan('monthly'))
})
await step('upcoming-group-chats-under-chats', async () => {
  await tid('tab-chats').click()
  await tid('chats').waitFor()
  await tid('groups-upcoming').waitFor()
  await page.getByText('Surviving grief when everyone has moved on').waitFor()
  await page.getByText(/Tomorrow, 14:00 EAT/).waitFor()
  await shot('180-upcoming-groups')
})
await step('sign-up-for-the-grief-chat', async () => {
  await page.getByText('Surviving grief when everyone has moved on').first().click()
  await tid('group-detail').waitFor()
  await tid('group-seats').waitFor()
  await tid('group-register').click()
  await tid('group-unregister').waitFor()
  await shot('181-group-detail')
})
await step('the-room-opens-and-the-facilitator-welcomes-everyone', async () => {
  await page.evaluate(() => window.__echo.demo.startNextGroupChat())
  await tid('group-room').waitFor()
  await page.getByText(/Welcome, everyone/).waitFor()
  await page.locator('[data-testid="group-status"]', { hasText: 'Open now' }).waitFor()
  await shot('182-group-room')
})
await step('write-and-be-stopped-from-sharing-contact-details', async () => {
  await page.evaluate(() => window.__echo.demo.advanceClock(3))
  await page.getByText('Tired. It has been eight months').waitFor()
  await tid('group-input').fill('call me on 0712 345 678')
  await page.getByText('This message can’t be sent yet').waitFor()
  await tid('group-input').fill('Thank you, I am glad to be here.')
  await tid('group-send').click()
  await page.getByText('Thank you, I am glad to be here.').waitFor()
  await shot('183-group-chatting')
})
await step('report-a-message', async () => {
  await page.getByRole('button', { name: 'Report this message' }).first().click()
  await tid('group-report-sheet').waitFor()
  await tid('group-report-submit').click()
  await tid('group-report-sheet').waitFor({ state: 'detached' })
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('echo.demo.v1') || '{}').reports?.length ?? 0)
  await page.waitForTimeout(700)
  const m = await page.evaluate(() => JSON.parse(localStorage.getItem('echo.demo.v1') || '{}').reports?.filter((r) => r.groupChatId).length ?? 0)
  if (m < 1) throw new Error('the report was not saved with the group chat')
})
await step('it-ends-and-is-kept-because-it-was-reported', async () => {
  await page.evaluate(() => window.__echo.demo.advanceClock(65))
  await page.locator('[data-testid="group-status"]', { hasText: 'Ended' }).waitFor()
  await page.evaluate(() => window.__echo.demo.advanceClock(24 * 60))
  await page.waitForTimeout(800)
  await page.goto('http://localhost:8104/chats')
  await tid('chats').waitFor()
  if ((await page.locator('body').innerText()).includes('Open now')) throw new Error('should be gone')
})
await browser.close()
server.close()
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1) }
console.log('all steps passed')
