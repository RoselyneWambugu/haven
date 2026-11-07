// Screenshots of the landing page and the main screens, for design review. Usage: node e2e/gallery.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8097)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const tid = (page, id) => page.locator(`[data-testid="${id}"]`)

// Landing, wide and narrow.
let page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
await page.goto('http://localhost:8097/landing')
await page.waitForTimeout(2200)
const part = async (name, offsets) => {
  for (const y of offsets) {
    await page.evaluate((top) => { const el = document.querySelector('[data-testid="landing"]'); if (el) el.scrollTop = top }, y)
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${out}/${name}-${y}.png` })
  }
}
await part('landing-wide', [0, 760, 1520, 2280, 3040])
await page.close()
page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:8097/landing')
await page.waitForTimeout(2200)
await part('landing-narrow', [0, 800, 1600, 2400, 3200, 4000])
await page.close()

// The member app, in a phone-sized window.
page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:8097/')
await page.waitForTimeout(2000)
await page.screenshot({ path: `${out}/m-welcome.png` })
const safe = async (name, fn) => { try { await fn() } catch (e) { console.log('skip', name, String(e).split('\n')[0]) } }
await safe('register', async () => {
  await tid(page, 'get-started').click()
  await page.screenshot({ path: `${out}/m-who.png` })
  await tid(page, 'who-member').click()
  await page.screenshot({ path: `${out}/m-consent.png` })
  for (const id of ['consent-terms', 'consent-privacy', 'consent-guidelines', 'consent-screening']) await tid(page, id).click()
  await tid(page, 'consent-continue').click()
  await tid(page, 'reg-name').fill('Amina Otieno')
  await tid(page, 'reg-phone').fill('0712 345 678')
  await tid(page, 'reg-dob').fill('14/03/1998')
  await page.screenshot({ path: `${out}/m-register.png` })
  await tid(page, 'register-continue').click()
  const code = (await tid(page, 'demo-code').innerText()).match(/(\d{6})/)[1]
  await tid(page, 'otp-input').fill(code)
  await tid(page, 'pen-input').fill('BrightFern')
  await page.screenshot({ path: `${out}/m-penname.png` })
  await tid(page, 'pen-continue').click()
  await tid(page, 'finish').click()
  await tid(page, 'home').waitFor()
})
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/m-home.png` })
await safe('plan', async () => {
  await page.evaluate(() => window.__echo.demo.grantPlan('monthly'))
  await page.waitForTimeout(500)
})
for (const [name, route] of [['chats', '/chats'], ['community', '/community'], ['therapists', '/therapists'], ['me', '/me'], ['plans', '/plans'], ['urgent', '/urgent'], ['help', '/help']]) {
  await safe(name, async () => {
    await page.goto(`http://localhost:8097${route}`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/m-${name}.png` })
  })
}
// The therapist portal and the staff dashboard, wide.
page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
await page.goto('http://localhost:8097/portal/sign-in')
await page.waitForTimeout(1800)
await page.screenshot({ path: `${out}/p-signin.png` })
await safe('portal', async () => {
  await tid(page, 'portal-demo-sign-in').click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/p-today.png` })
})
await page.goto('http://localhost:8097/staff/sign-in')
await page.waitForTimeout(1500)
await safe('admin', async () => {
  await page.getByText('Sign in', { exact: true }).first().click().catch(() => {})
  await page.screenshot({ path: `${out}/a-signin.png` })
})
await browser.close()
server.close()
console.log('done')
