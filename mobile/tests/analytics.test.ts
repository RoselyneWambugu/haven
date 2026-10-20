import { describe, expect, it } from 'vitest'
import { buildDays, change, cohorts, DAY, funnel, histogram, memberFunnel, MIN_CELL, pct, percentile, retentionBin, ratio, reviewMinutes, rng, sectionsFor, series, suppress, sum, therapyFunnel, toCsv, whoIsUsing } from '../src/lib/analytics'

const anchor = Date.UTC(2026, 9, 19)

describe('helpers', () => {
  it('finds percentiles', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([10], 95)).toBe(10)
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5)
    expect(percentile([0, 100], 95)).toBe(95)
  })
  it('never divides by zero', () => {
    expect(ratio(3, 0)).toBeNull()
    expect(ratio(1, 4)).toBe(0.25)
    expect(change(5, 0)).toBeNull()
    expect(change(120, 100)).toBeCloseTo(0.2)
    expect(pct(null)).toBe('—')
    expect(pct(0.256)).toBe('26%')
  })
  it('hides cells smaller than the minimum', () => {
    expect(suppress(MIN_CELL - 1)).toBeNull()
    expect(suppress(MIN_CELL)).toBe(MIN_CELL)
  })
  it('is repeatable', () => {
    const a = rng(7)
    const b = rng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('sample data', () => {
  const days = buildDays(anchor)
  it('covers 180 days ending today, the same every time', () => {
    expect(days.length).toBe(180)
    expect(days.at(-1)!.t).toBe(anchor)
    expect(buildDays(anchor)).toEqual(days)
  })
  it('never grows at a funnel step', () => {
    for (const d of days) {
      expect(d.registered).toBeLessThanOrEqual(d.installs)
      expect(d.verified).toBeLessThanOrEqual(d.registered)
      expect(d.profiled).toBeLessThanOrEqual(d.verified)
      expect(d.matched).toBeLessThanOrEqual(d.profiled)
      expect(d.firstMessage).toBeLessThanOrEqual(d.matched)
      expect(d.subscribed).toBeLessThanOrEqual(d.firstMessage)
    }
  })
  it('sums a range and compares it with the one before', () => {
    const now7 = sum(days, 7)
    const prev7 = sum(days, 7, 1)
    expect(now7.installs).toBe(days.slice(-7).reduce((n, d) => n + d.installs, 0))
    expect(prev7.installs).toBe(days.slice(-14, -7).reduce((n, d) => n + d.installs, 0))
    expect(series(days, 'installs', 30).length).toBe(30)
  })
  it('keeps every figure free of message text and identities', () => {
    expect(Object.keys(days[0]).every((k) => typeof (days[0] as never)[k] === 'number')).toBe(true)
  })
})

describe('funnels', () => {
  it('works out each step against the previous and the first', () => {
    const f = funnel([{ label: 'a', count: 100 }, { label: 'b', count: 60 }, { label: 'c', count: 15 }])
    expect(f[0]).toMatchObject({ ofPrev: null, ofFirst: null })
    expect(f[1]).toMatchObject({ ofPrev: 0.6, ofFirst: 0.6 })
    expect(f[2].ofPrev).toBe(0.25)
    expect(f[2].ofFirst).toBe(0.15)
  })
  it('lists the member and therapy funnels in order', () => {
    const t = sum(buildDays(anchor), 30)
    const m = memberFunnel(t)
    expect(m.map((s) => s.label)[0]).toBe('Installed')
    expect(m.at(-1)!.label).toBe('Subscribed')
    expect(m.every((s, i) => i === 0 || s.count <= m[i - 1].count)).toBe(true)
    expect(therapyFunnel(t).length).toBe(4)
  })
})

describe('retention', () => {
  const c = cohorts(anchor)
  it('has eight weekly cohorts and only reports a day-30 figure once it is old enough', () => {
    expect(c.length).toBe(8)
    expect(c[0].d30).not.toBeNull()
    expect(c.at(-1)!.d30).toBeNull()
    expect(c.at(-1)!.d7).toBeNull()
    expect(c.at(-1)!.d1).not.toBeNull()
  })
  it('bins figures into the four ramp steps', () => {
    expect(retentionBin(null, 0.4)).toBe(-1)
    expect(retentionBin(0.1, 0.4)).toBe(0)
    expect(retentionBin(0.2, 0.4)).toBe(1)
    expect(retentionBin(0.33, 0.4)).toBe(2)
    expect(retentionBin(0.4, 0.4)).toBe(3)
  })
})

describe('privacy of breakdowns', () => {
  it('hides small groups, so a cell cannot point at a handful of people', () => {
    const b = whoIsUsing()
    const shown = b.cells.flat().filter((x): x is number => x !== null)
    expect(shown.every((n) => n >= MIN_CELL)).toBe(true)
    expect(b.cells.flat().some((x) => x === null)).toBe(true)
  })
})

describe('safety timings', () => {
  it('reports a median and a 95th percentile, and buckets the spread', () => {
    const v = reviewMinutes()
    expect(percentile(v, 95)!).toBeGreaterThan(percentile(v, 50)!)
    const h = histogram(v, [0, 10, 20, 30, 45, 60])
    expect(h.reduce((n, x) => n + x.count, 0)).toBe(v.length)
    expect(h.at(-1)!.label).toBe('45+')
  })
})

describe('who sees what', () => {
  it('limits each role to its own sections', () => {
    expect(sectionsFor('admin')).toEqual(['product', 'care', 'commercial', 'safety'])
    expect(sectionsFor('billing')).toEqual(['commercial'])
    expect(sectionsFor('moderator')).toEqual(['safety'])
    expect(sectionsFor('clinical')).toEqual(['care', 'safety'])
  })
})

describe('csv', () => {
  it('quotes awkward text and leaves blanks for hidden cells', () => {
    expect(toCsv([['a,b', 'c"d', null, 3]])).toBe('"a,b","c""d",,3')
  })
})
void DAY
