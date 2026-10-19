// Usage: node e2e/shot.mjs <webroot> <out.png> [route]
import { chromium } from 'playwright-core'
import { serve } from './serve.mjs'

const [root, out, route = '/'] = process.argv.slice(2)
const server = await serve(root, 8099)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('[console]', m.type(), m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)))
await page.goto(`http://localhost:8099${route}`)
await page.waitForTimeout(2500)
await page.screenshot({ path: out })
console.log('url:', page.url())
await browser.close()
server.close()
