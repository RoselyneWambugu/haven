// Renders the Echo logo mark to the PNG assets Expo needs. Usage: node e2e/make-icons.mjs
import { chromium } from 'playwright-core'

const mark = (stroke, bg, pad, size, sun = '#F0A34A') => `<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg}">
<svg width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${32 + 2 * pad} ${32 + 2 * pad}" fill="none">
<circle cx="16" cy="16" r="3" fill="${sun}"/>
<path d="M10.5 10.5a7.8 7.8 0 0 0 0 11" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round"/>
<path d="M21.5 10.5a7.8 7.8 0 0 1 0 11" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round"/>
<path d="M6.4 6.6a13.4 13.4 0 0 0 0 18.8" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
<path d="M25.6 6.6a13.4 13.4 0 0 1 0 18.8" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
</svg></body></html>`

const jobs = [
  ['icon.png', 1024, mark('#F5F6EA', '#1C372A', 4, 1024)],
  ['splash-icon.png', 1024, mark('#1C372A', 'transparent', 0, 1024)],
  ['android-icon-foreground.png', 512, mark('#F5F6EA', 'transparent', 14, 512)],
  ['android-icon-background.png', 512, `<html><body style="margin:0;width:512px;height:512px;background:#1C372A"></body></html>`],
  ['android-icon-monochrome.png', 432, mark('#000', 'transparent', 14, 432, '#000')],
  ['favicon.png', 48, mark('#1C372A', '#F5F6EA', 2, 48)],
]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const [file, size, html] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(html)
  await page.screenshot({ path: `assets/${file}`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log('icons written')
