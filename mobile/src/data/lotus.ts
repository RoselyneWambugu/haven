/**
 * The Echo logo: a glowing lotus with a heart at its centre, a looped stem beneath, on deep teal. It is drawn once, as shapes,
 * and used everywhere: the app mark, the app icon, the splash screen, the web favicon and the brand files. SVG files and the app
 * draw exactly the same thing. No imports, so the icon script can read it.
 *
 * Everything is in a 1024 by 1024 box, centred on (512, 512).
 */

export const LOTUS_VIEWBOX = '0 0 1024 1024'

type Pt = [number, number]

interface Leaf {
  base: Pt
  tip: Pt
  /** Half the width of the leaf. */
  w: number
  /** Which side it bows towards: 1 or -1. */
  bow: 1 | -1
}

/** Back to front: the lower leaves, the outer ones, the upper ones, then the top one. */
const LEAVES: Leaf[] = [
  { base: [452, 650], tip: [215, 690], w: 88, bow: -1 },
  { base: [572, 650], tip: [809, 690], w: 88, bow: 1 },
  { base: [425, 565], tip: [175, 495], w: 98, bow: -1 },
  { base: [599, 565], tip: [849, 495], w: 98, bow: 1 },
  { base: [445, 478], tip: [290, 315], w: 96, bow: -1 },
  { base: [579, 478], tip: [734, 315], w: 96, bow: 1 },
  { base: [512, 445], tip: [512, 238], w: 104, bow: 1 },
]

const r1 = (n: number) => Math.round(n * 10) / 10

/** The unit vector along the leaf and the one across it. */
function axes(l: Leaf): { len: number; u: Pt; n: Pt } {
  const dx = l.tip[0] - l.base[0]
  const dy = l.tip[1] - l.base[1]
  const len = Math.hypot(dx, dy)
  const u: Pt = [dx / len, dy / len]
  return { len, u, n: [-u[1], u[0]] }
}

/** A pointed leaf: rounded at the base end, narrow at the tip, and a little fuller on one side. */
function leafPath(l: Leaf): string {
  const { len, u, n } = axes(l)
  const at = (t: number, side: number, wide: number): Pt => [l.base[0] + u[0] * len * t + n[0] * l.w * side * wide, l.base[1] + u[1] * len * t + n[1] * l.w * side * wide]
  const p = (q: Pt) => `${r1(q[0])} ${r1(q[1])}`
  const a = at(0.18, 1, 1.45)
  const b = at(0.72, 1, 1.05)
  const c = at(0.72, -1, 1.0)
  const d = at(0.2, -1, 1.4)
  return `M${p(l.base)} C${p(a)} ${p(b)} ${p(l.tip)} C${p(c)} ${p(d)} ${p(l.base)} Z`
}

/** Fine veins: one down the middle and three pairs branching out, drawn the way a leaf is veined. */
function veinPaths(l: Leaf): string[] {
  const { len, u, n } = axes(l)
  const along = (t: number, across = 0): Pt => [l.base[0] + u[0] * len * t + n[0] * l.w * across, l.base[1] + u[1] * len * t + n[1] * l.w * across]
  const q = (p: Pt) => `${r1(p[0])} ${r1(p[1])}`
  const out: string[] = []
  // The middle vein, with a slight bend.
  out.push(`M${q(along(0.06))} Q${q(along(0.5, 0.1))} ${q(along(0.84))}`)
  // Branches leave the middle vein and curve towards the tip, staying well inside the leaf, which narrows as it nears the tip.
  for (const t of [0.24, 0.42, 0.6]) {
    const reach = 0.62 * (1 - t) + 0.12
    for (const side of [1, -1]) out.push(`M${q(along(t, 0.04 * side))} Q${q(along(t + 0.06, reach * 0.6 * side))} ${q(along(t + 0.2, reach * side))}`)
  }
  return out
}

/** The heart, centred at (512, 538), and the ring around it. */
const HEART = 'M512 645 C426 586 392 546 392 500 C392 458 424 436 456 436 C484 436 504 452 512 470 C520 452 540 436 568 436 C600 436 632 458 632 500 C632 546 598 586 512 645 Z'
const RING = 'M512 672 C410 604 366 556 366 496 C366 440 408 408 450 408 C482 408 504 426 512 444 C520 426 542 408 574 408 C616 408 658 440 658 496 C658 556 614 604 512 672 Z'
/** The loop of stem under the flower. */
const STEM = 'M512 672 C500 706 492 738 502 764 C514 794 546 780 534 752 C526 732 520 706 512 672'

export interface LotusPalette {
  key: string
  /** The glowing edge of each leaf and of the stem. */
  edge: string
  /** The veins and the ring around the heart. */
  vein: string
  /** The leaf fill: at its base and at its tip. */
  leafBase: string
  leafTip: string
  leafBaseOpacity: number
  leafTipOpacity: number
  /** The heart. */
  heart: string
  glow: string
  glowOpacity: number
  /** Leaves as outlines only, for one-colour use. */
  outline?: boolean
}

export const ON_DARK: LotusPalette = {
  key: 'd', edge: '#A9EBCB', vein: '#EFDFA6', leafBase: '#4E9A80', leafTip: '#7CC7A6', leafBaseOpacity: 0.62, leafTipOpacity: 0.36, heart: '#C9F7E1', glow: '#9FE8C6', glowOpacity: 0.26,
}
/** The same logo for use on a pale background: deeper edges so the glow still reads. */
export const ON_LIGHT: LotusPalette = {
  key: 'l', edge: '#3E8E75', vein: '#B79B45', leafBase: '#3E8E75', leafTip: '#8FD0B1', leafBaseOpacity: 0.55, leafTipOpacity: 0.3, heart: '#7CC7A6', glow: '#9FE8C6', glowOpacity: 0.2,
}
/** One colour, for stamps and the Android themed icon. */
export const mono = (c: string): LotusPalette => ({
  key: 'm', edge: c, vein: c, leafBase: c, leafTip: c, leafBaseOpacity: 1, leafTipOpacity: 1, heart: c, glow: c, glowOpacity: 0, outline: true,
})

// ---------------------------------------------------------------------------
// The drawing, as data.
// ---------------------------------------------------------------------------

export interface Stop {
  offset: number
  color: string
  opacity: number
}
export type Gradient =
  | { id: string; kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: Stop[] }
  | { id: string; kind: 'radial'; cx: number; cy: number; r: number; stops: Stop[] }
export interface Shape {
  d: string
  fill: string
  fillOpacity?: number
  stroke?: string
  strokeWidth?: number
  strokeOpacity?: number
}
export interface Scene {
  gradients: Gradient[]
  shapes: Shape[]
}

/** A rounded square as a path, for the logo's tile. A radius of 0 gives a plain square. */
function tilePath(radius: number): string {
  const r = radius
  return r === 0 ? 'M0 0 H1024 V1024 H0 Z' : `M${r} 0 H${1024 - r} Q1024 0 1024 ${r} V${1024 - r} Q1024 1024 ${1024 - r} 1024 H${r} Q0 1024 0 ${1024 - r} V${r} Q0 0 ${r} 0 Z`
}

/**
 * The logo as shapes and gradients. `tile` puts it on its deep teal square (with rounded corners by `radius`).
 * `rich` adds the veins and the soft glow; leave it off below about 40 px, where they would only be noise.
 */
export function lotusScene(pal: LotusPalette, opts: { rich?: boolean; tile?: boolean; radius?: number } = {}): Scene {
  const { rich = true, tile = false, radius = 0 } = opts
  const gradients: Gradient[] = []
  const shapes: Shape[] = []
  const id = (s: string) => `echo-${pal.key}-${s}`

  if (tile) {
    gradients.push({ id: id('tile'), kind: 'radial', cx: 512, cy: 500, r: 760, stops: [{ offset: 0, color: '#2B5C54', opacity: 1 }, { offset: 1, color: '#1B3F3B', opacity: 1 }] })
    shapes.push({ d: tilePath(radius), fill: `url(#${id('tile')})` })
  }
  if (rich && pal.glowOpacity > 0) {
    gradients.push({ id: id('glow'), kind: 'radial', cx: 512, cy: 520, r: 400, stops: [{ offset: 0, color: pal.glow, opacity: pal.glowOpacity }, { offset: 1, color: pal.glow, opacity: 0 }] })
    shapes.push({ d: 'M112 520 a400 400 0 1 0 800 0 a400 400 0 1 0 -800 0 Z', fill: `url(#${id('glow')})` })
  }

  const sw = pal.outline ? 16 : 7
  LEAVES.forEach((l, i) => {
    const d = leafPath(l)
    const gid = id(`leaf-${i}`)
    if (!pal.outline) {
      const { len } = axes(l)
      const tipPt = l.tip
      gradients.push({ id: gid, kind: 'linear', x1: l.base[0], y1: l.base[1], x2: tipPt[0], y2: tipPt[1], stops: [{ offset: 0, color: pal.leafBase, opacity: pal.leafBaseOpacity }, { offset: 1, color: pal.leafTip, opacity: pal.leafTipOpacity }] })
      void len
    }
    if (rich && !pal.outline) {
      // A soft halo: the same leaf, stroked wide and faint, so the edge seems to glow.
      shapes.push({ d, fill: 'none', stroke: pal.edge, strokeWidth: 26, strokeOpacity: 0.07 })
      shapes.push({ d, fill: 'none', stroke: pal.edge, strokeWidth: 14, strokeOpacity: 0.14 })
    }
    shapes.push({ d, fill: pal.outline ? 'none' : `url(#${gid})`, stroke: pal.edge, strokeWidth: sw, strokeOpacity: 1 })
    if (rich && !pal.outline) for (const v of veinPaths(l)) shapes.push({ d: v, fill: 'none', stroke: pal.vein, strokeWidth: 3, strokeOpacity: 0.75 })
  })

  if (rich && !pal.outline) shapes.push({ d: RING, fill: 'none', stroke: pal.edge, strokeWidth: 24, strokeOpacity: 0.1 })
  shapes.push({ d: RING, fill: 'none', stroke: pal.outline ? pal.edge : pal.vein, strokeWidth: pal.outline ? 14 : 9 })
  if (rich && !pal.outline) shapes.push({ d: HEART, fill: 'none', stroke: pal.heart, strokeWidth: 30, strokeOpacity: 0.18 })
  shapes.push({ d: HEART, fill: pal.heart })
  shapes.push({ d: STEM, fill: 'none', stroke: pal.edge, strokeWidth: pal.outline ? 14 : 8 })
  return { gradients, shapes }
}

/** The scene as SVG markup, for the brand files and the icon images. */
export function lotusSvg(pal: LotusPalette, opts: { rich?: boolean; tile?: boolean; radius?: number } = {}): string {
  const { gradients, shapes } = lotusScene(pal, opts)
  const stop = (s: Stop) => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`
  const defs = gradients
    .map((g) =>
      g.kind === 'linear'
        ? `<linearGradient id="${g.id}" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${g.stops.map(stop).join('')}</linearGradient>`
        : `<radialGradient id="${g.id}" gradientUnits="userSpaceOnUse" cx="${g.cx}" cy="${g.cy}" r="${g.r}">${g.stops.map(stop).join('')}</radialGradient>`,
    )
    .join('')
  const body = shapes
    .map((s) => `<path d="${s.d}" fill="${s.fill}"${s.fillOpacity !== undefined ? ` fill-opacity="${s.fillOpacity}"` : ''}${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"` : ''}${s.strokeOpacity !== undefined ? ` stroke-opacity="${s.strokeOpacity}"` : ''}/>`)
    .join('')
  return `<defs>${defs}</defs>${body}`
}
