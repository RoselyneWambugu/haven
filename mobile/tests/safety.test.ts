import { describe, expect, it } from 'vitest'
import { detectBlockedContent, detectDistress, detectIdentifyingDetails, explainBlock, suggestPenNames, validatePenName } from '../src/lib/safety'

const blocked = (s: string) => detectBlockedContent(s)

describe('blocking contact details', () => {
  it.each([
    ['call me on 0712345678', 'phone'],
    ['my number is 0712 345 678', 'phone'],
    ['+254 712 345 678', 'phone'],
    ['254712345678', 'phone'],
    ['0712-345-678', 'phone'],
    ['0 7 1 2 3 4 5 6 7 8', 'phone'],
    ['zero seven one two three four five six seven eight', 'phone'],
    ['sifuri saba moja mbili tatu nne tano sita saba nane', 'phone'],
    ['o712345678', 'phone'],
    ['07oo 123 456', 'phone'],
    ['02012345678', 'phone'],
  ])('blocks a phone number: %s', (text, reason) => {
    expect(blocked(text).reasons).toContain(reason)
  })

  it.each([
    'check https://example.com/me',
    'go to www.mysite.org',
    'find me at mysite dot com',
    'mysite (dot) com',
    'visit wa.me/254712345678',
    'bit.ly/abc123',
    'see my page example.net',
  ])('blocks a link: %s', (text) => {
    expect(blocked(text).reasons).toContain('link')
  })

  it.each([
    ['write to jane.doe@gmail.com', 'email'],
    ['jane at gmail dot com', 'email'],
    ['reach me at jane(at)mail(dot)com', 'email'],
  ])('blocks an email: %s', (text, reason) => {
    expect(blocked(text).reasons).toContain(reason)
  })

  it.each([
    'add me on whatsapp',
    'my instagram is something',
    'dm me on telegram',
    'follow me @quiet_pine',
    'my snapchat handle is cool',
  ])('blocks a social handle: %s', (text) => {
    expect(blocked(text).reasons).toContain('handle')
  })

  it.each([
    'my address is somewhere',
    'P.O. Box 1234',
    'I live at plot 45',
    'house no 12',
    '12 Moi Avenue',
    'opposite the Naivas supermarket',
    'next to Shell petrol station',
  ])('blocks an address: %s', (text) => {
    expect(blocked(text).reasons).toContain('address')
  })

  it.each([
    'I feel really low today',
    'I am 25 years old and have 3 kids',
    'I got 70 out of 100 on 12/10/2026',
    'We met on 21 10 2026 at 10 30',
    'It cost 1500 shillings and 250 for transport',
    'I tried my best.Me too',
    'I have been awake since 4 and it is now 7',
    'Thank you, that really helped',
    'Do you want to talk more about work?',
    'I read about it on Facebook once',
    'No one understands me, one day at a time',
    'My house is quiet and I live with my mum',
  ])('lets ordinary talk through: %s', (text) => {
    expect(blocked(text)).toEqual({ blocked: false, reasons: [] })
  })

  it('explains in plain, kind words', () => {
    expect(explainBlock(['phone'])).toBe('Phone numbers can’t be shared here. It keeps everyone anonymous.')
    expect(explainBlock(['link', 'phone'])).toContain('Phone numbers, links and contact details')
    expect(explainBlock([])).toContain('Contact details')
  })

  it('reports every reason found', () => {
    const r = blocked('call 0712345678 or see www.x.com, my address is here')
    expect(r.reasons.sort()).toEqual(['address', 'link', 'phone'])
  })
})

describe('identifying details in public posts', () => {
  it('finds places, workplaces, schools and names', () => {
    const found = detectIdentifyingDetails(
      'I moved to Kisumu for my job at Acme Ltd and I study at Maseno University. My name is Amina Otieno.',
    )
    const kinds = found.map((f) => f.kind).sort()
    expect(kinds).toEqual(['name', 'place', 'school', 'workplace'])
    expect(found.find((f) => f.kind === 'workplace')?.text).toBe('Acme Ltd')
  })
  it('leaves a general post alone', () => {
    expect(detectIdentifyingDetails('I have been feeling overwhelmed and cannot sleep before exams.')).toEqual([])
  })
  it('does not match place names inside other words', () => {
    expect(detectIdentifyingDetails('The karenina novel was long')).toEqual([])
  })
})

describe('distress signals', () => {
  it.each(['I want to die', 'thinking about suicide', "I don't want to live", 'nataka kufa', 'I keep cutting myself'])(
    'high: %s',
    (t) => expect(detectDistress(t).level).toBe('high'),
  )
  it.each(["I can't do this anymore", 'everything feels hopeless'])('possible: %s', (t) =>
    expect(detectDistress(t).level).toBe('possible'),
  )
  it('none for ordinary worry', () => {
    expect(detectDistress('Work has been a lot this week').level).toBe('none')
  })
  it('handles curly apostrophes', () => {
    expect(detectDistress('I don’t want to live like this').level).toBe('high')
  })
})

describe('pen names', () => {
  it.each(['QuietPine', 'RainyDay', 'NightOwl22', 'Blue_Heron'])('accepts %s', (n) => {
    expect(validatePenName(n)).toEqual({ ok: true })
  })
  it.each([
    ['ab', 'length'],
    ['ThisNameIsFarTooLongToUse', 'length'],
    ['Quiet Pine', 'characters'],
    ['9lives', 'characters'],
    ['0712345678', 'characters'],
    ['Amina', 'real-name'],
    ['AminaOtieno', 'real-name'],
    ['JamesMwangi', 'real-name'],
    ['Amina22', 'real-name'],
    ['Admin', 'reserved'],
    ['Echo_support', 'reserved'],
    ['mysite_com', 'contact'],
  ])('rejects %s as %s', (n, problem) => {
    const r = validatePenName(n)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problem).toBe(problem)
  })
  it('gives friendly messages', () => {
    const r = validatePenName('Amina')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/real name/)
  })
  it('suggests valid, repeatable names', () => {
    const a = suggestPenNames(7)
    expect(a).toHaveLength(3)
    a.forEach((n) => expect(validatePenName(n)).toEqual({ ok: true }))
    expect(suggestPenNames(7)).toEqual(a)
    expect(suggestPenNames(8)).not.toEqual(a)
  })
})
