// Draws the logo on a few backgrounds so the design can be judged. Usage: node --experimental-strip-types e2e/lotus-preview.mjs <out.png>
import { chromium } from 'playwright-core'
import { lotusSvg, ON_DARK, ON_LIGHT, LOTUS_VIEWBOX } from '../src/data/lotus.ts'

const card = (svg, label, bg = '#E9ECD8') => `<div style="width:330px;padding:24px;background:${bg};border-radius:28px;display:flex;flex-direction:column;align-items:center;gap:12px">
<svg width="280" height="280" viewBox="${LOTUS_VIEWBOX}" fill="none">${svg}</svg><div style="font:600 15px sans-serif;color:#1C372A">${label}</div></div>`
const html = `<html><body style="margin:0;padding:24px;background:#F5F6EA;display:flex;gap:20px;flex-wrap:wrap;width:1180px">
${card(lotusSvg(ON_DARK, { tile: true, radius: 200 }), 'Tile (app mark and icon)')}
${card(lotusSvg(ON_LIGHT, { tile: false }), 'On paper', '#F5F6EA')}
${card(lotusSvg(ON_DARK, { rich: false, tile: true, radius: 200 }), 'Small sizes')}
</body></html>`
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1230, height: 400 } })
await page.setContent(html)
await page.screenshot({ path: process.argv[2] })
await browser.close()
