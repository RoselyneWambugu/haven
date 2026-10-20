// Draws the Echo logo into the icon files Expo needs, and the brand SVGs. Usage: node --experimental-strip-types e2e/make-icons.mjs
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { lotusSvg, mono, ON_DARK } from '../src/data/lotus.ts'

const TEAL = '#1B3F3B'

/** The logo in a square, with `pad` units of room around its 1024-unit box. `bg` is a colour, or 'teal' for the deep teal with a little light in the middle. */
const frame = (inner, size, pad = 0, bg = 'none') => {
  const box = `${-pad} ${-pad} ${1024 + 2 * pad} ${1024 + 2 * pad}`
  const back = bg === 'none' ? '' : bg === 'teal'
    ? `<defs><radialGradient id="echo-bg" gradientUnits="userSpaceOnUse" cx="512" cy="500" r="${(1024 + 2 * pad) * 0.75}"><stop offset="0" stop-color="#2B5C54"/><stop offset="1" stop-color="${TEAL}"/></radialGradient></defs><rect x="${-pad}" y="${-pad}" width="${1024 + 2 * pad}" height="${1024 + 2 * pad}" fill="url(#echo-bg)"/>`
    : `<rect x="${-pad}" y="${-pad}" width="${1024 + 2 * pad}" height="${1024 + 2 * pad}" fill="${bg}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${box}" fill="none">${back}${inner}</svg>`
}
const page = (svg) => `<html><body style="margin:0;background:transparent">${svg}</body></html>`

const jobs = [
  // iOS and the store listing: the logo on its tile, with no transparency (the phone rounds the corners).
  ['icon.png', 1024, frame(lotusSvg(ON_DARK), 1024, 0, 'teal')],
  // Android adaptive icon: the logo sits inside the safe zone on the teal background.
  ['android-icon-foreground.png', 512, frame(lotusSvg(ON_DARK), 512, 170)],
  ['android-icon-background.png', 512, frame('', 512, 0, 'teal')],
  // Android themed icon: one colour, the phone tints it.
  ['android-icon-monochrome.png', 432, frame(lotusSvg(mono('#000')), 432, 170)],
  // The splash screen sits on teal, so the glowing logo shows without a tile.
  ['splash-icon.png', 1024, frame(lotusSvg(ON_DARK), 1024, 0)],
  // A tab icon is tiny: the tile with rounded corners, without the veins and the glow.
  ['favicon.png', 64, frame(lotusSvg(ON_DARK, { rich: false, tile: true, radius: 200 }), 64, 0)],
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const [file, size, svg] of jobs) {
  const p = await browser.newPage({ viewport: { width: size, height: size } })
  await p.setContent(page(svg))
  await p.screenshot({ path: `assets/${file}`, omitBackground: true })
  await p.close()
}
await browser.close()

mkdirSync('../docs/brand', { recursive: true })
const out = {
  'echo-logo.svg': frame(lotusSvg(ON_DARK, { tile: true, radius: 230 }), 1024, 0),
  'echo-logo-no-tile.svg': frame(lotusSvg(ON_DARK), 1024, 0),
  'echo-logo-mono.svg': frame(lotusSvg(mono('#1B3F3B')), 1024, 0),
  'echo-app-icon.svg': frame(lotusSvg(ON_DARK), 1024, 0, 'teal'),
}
for (const [f, svg] of Object.entries(out)) writeFileSync(`../docs/brand/${f}`, svg)
console.log('icons and brand files written')
