import { describe, expect, it } from 'vitest'
import { ageBand, ageBandLabel, ageOn, formatPhone, maskPhone, neighbouringBands, normaliseKenyanPhone, parseDob } from '../src/lib/identity'

describe('Kenyan phone numbers', () => {
  it.each([
    ['0712 345 678', '+254712345678'],
    ['+254 712 345 678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['0112-345-678', '+254112345678'],
    ['(0712) 345.678', '+254712345678'],
  ])('normalises %s', (input, out) => expect(normaliseKenyanPhone(input)).toBe(out))
  it.each(['', '12345', '0212345678', '+1 415 555 0100', 'abc', '07123456789'])('rejects %s', (input) =>
    expect(normaliseKenyanPhone(input)).toBeNull(),
  )
  it('masks and formats', () => {
    expect(maskPhone('+254712345678')).toBe('+254 712 ••• 678')
    expect(formatPhone('+254712345678')).toBe('+254 712 345 678')
    expect(maskPhone('weird')).toBe('weird')
  })
})

describe('dates of birth and age gating', () => {
  const now = new Date(Date.UTC(2026, 9, 19))
  it('parses real dates only', () => {
    expect(parseDob('14/03/1998')?.toISOString()).toBe('1998-03-14T00:00:00.000Z')
    expect(parseDob('1-2-2000')).not.toBeNull()
    expect(parseDob('31/02/2000')).toBeNull()
    expect(parseDob('00/01/2000')).toBeNull()
    expect(parseDob('14/03/1899')).toBeNull()
    expect(parseDob('hello')).toBeNull()
  })
  it('counts birthdays correctly', () => {
    const dob = parseDob('20/10/2008')!
    expect(ageOn(dob, now)).toBe(17)
    expect(ageOn(parseDob('19/10/2008')!, now)).toBe(18)
    expect(ageOn(parseDob('29/02/2000')!, new Date(Date.UTC(2026, 1, 28)))).toBe(25)
  })
  it('bands adults only', () => {
    expect(ageBand(17)).toBeNull()
    expect(ageBand(18)).toBe('18-24')
    expect(ageBand(24)).toBe('18-24')
    expect(ageBand(25)).toBe('25-34')
    expect(ageBand(44)).toBe('35-44')
    expect(ageBand(54)).toBe('45-54')
    expect(ageBand(55)).toBe('55+')
    expect(ageBandLabel('25-34')).toBe('25 to 34')
    expect(ageBandLabel('55+')).toBe('55 and over')
  })
  it('never lists a minor band as a neighbour', () => {
    expect(neighbouringBands('18-24')).toEqual(['25-34'])
    expect(neighbouringBands('35-44')).toEqual(['25-34', '45-54'])
  })
})
