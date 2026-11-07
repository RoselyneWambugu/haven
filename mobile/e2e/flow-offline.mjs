// The website opens with no internet once it has been opened online. Usage: node e2e/flow-offline.mjs <webroot> <outdir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { serve } from './serve.mjs'

const [root, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await serve(root, 8101)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 420, height: 800 } })
const page = await context.newPage()
const tid = (id) => page.locator(`[data-testid="${id}"]`)
try {
  await page.goto('http://localhost:8101/')
  await page.waitForTimeout(2500)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // the copy is saved while the first page loads
  await page.waitForTimeout(1500)
  await context.setOffline(true)
  await page.reload()
  await tid('landing-start').or(tid('welcome-start')).or(page.getByText(/Get started/i)).first().waitFor({ timeout: 15000 })
  await page.screenshot({ path: `${out}/offline.png` })
  console.log('ok   opens offline')
} catch (e) {
  console.log('FAIL opens offline', String(e).split('\n')[0])
  await page.screenshot({ path: `${out}/FAIL-offline.png` })
  process.exitCode = 1
}
await browser.close()
server.close()
