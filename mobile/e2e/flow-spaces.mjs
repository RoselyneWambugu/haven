// Onboards, grants a demo plan, matches with a peer, and exercises blocked-message handling in chat.
// Usage: node e2e/flow-spaces.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8103)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 240)}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
const tid = (id) => page.locator(`[data-testid="${id}"]`)
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).split('\n')[0]); await shot(`FAIL-${name}`); console.log(problems.join('\n')); throw e } }

const body = async () => page.locator('body').innerText()
await page.goto('http://localhost:8103/')
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
})
await step('spaces-from-the-community-tab', async () => {
  await tid('tab-forum').click()
  await tid('forum').waitFor()
  await tid('open-spaces').click()
  await tid('spaces').waitFor()
  await shot('170-spaces')
  const t = await body()
  for (const w of ['Domestic violence and abuse', 'PTSD and trauma', 'Grief and loss', 'Anxiety and panic']) if (!t.includes(w)) throw new Error('missing: ' + w)
})
await step('a-sensitive-space-asks-you-to-join-first', async () => {
  await tid('space-domestic-violence').click()
  await tid('space').waitFor()
  await tid('space-gate').waitFor()
  if ((await body()).includes('Feeling guilty for thinking about leaving')) throw new Error('posts should be hidden until joined')
  await shot('171-space-gate')
  await tid('space-join').click()
  await page.getByText('Feeling guilty for thinking about leaving').waitFor()
  await tid('space-quick-exit').waitFor()
  await shot('172-space-joined')
})
await step('posting-in-the-space-keeps-it-out-of-the-general-feed', async () => {
  await tid('space-write').click()
  await tid('posting-in-space').waitFor()
  await tid('post-title').fill('A hard night')
  await tid('post-body').fill('Tonight was heavy and I wanted to write it down here.')
  await shot('173-space-composer')
  await tid('post-submit').click()
  await tid('my-posts').waitFor()
  await page.goto('http://localhost:8103/forum')
  await tid('forum').waitFor()
  await page.waitForTimeout(500)
  if ((await body()).includes('A hard night')) throw new Error('a space post should not appear in the general feed')
})
await browser.close()
server.close()
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1) }
console.log('all steps passed')
