/**
 * Safety rules that run on the device, before anything is sent.
 *
 * These are rule-based and deliberately conservative. They are the *baseline*
 * described in the PRD (SAF-6): a first line of defence that also tells the
 * member, kindly, why something was stopped. They are NOT a substitute for
 * server-side screening, human review, or clinical judgement, and every list
 * here needs review by the safety and clinical team before launch.
 */

// ---------------------------------------------------------------------------
// 1. Contact details and links (PRD MSG-1, FRM-3)
// ---------------------------------------------------------------------------

export type BlockReason = 'link' | 'phone' | 'email' | 'handle' | 'address'

export interface BlockResult {
  blocked: boolean
  reasons: BlockReason[]
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', sifuri: '0',
  one: '1', moja: '1',
  two: '2', mbili: '2',
  three: '3', tatu: '3',
  four: '4', nne: '4',
  five: '5', tano: '5',
  six: '6', sita: '6',
  seven: '7', saba: '7',
  eight: '8', nane: '8',
  nine: '9', tisa: '9',
}

const STRONG_TLDS = 'com|org|net|app|info|link|site|online|xyz|tv|africa|biz|store|shop|live|chat|today'
const WEAK_TLDS = 'me|co|io|ly|ke|gl|gg|cc|to|vc'

const PLATFORMS =
  'whatsapp|whats app|telegram|instagram|insta|snapchat|snap|facebook|fb|tiktok|signal|discord|wechat|twitter|x\\.com|linkedin'
const CONTACT_VERBS =
  'add|dm|pm|msg|message|text|call|contact|reach|find|follow|hit|ping|inbox|my|handle|number|username|user name|@'

function normalise(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[​-‍﻿­]/g, '')
    .toLowerCase()
}

/** Finds runs of digits, including spelled-out digits and a leading "o" used for zero. */
function digitRuns(text: string): { digits: string; spelled: boolean }[] {
  const tokens = text.split(/[^a-z0-9+]+/).filter(Boolean)
  const runs: { digits: string; spelled: boolean }[] = []
  let cur = ''
  let spelled = false
  const flush = () => {
    if (cur) runs.push({ digits: cur, spelled })
    cur = ''
    spelled = false
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const word = DIGIT_WORDS[tok]
    if (word !== undefined) {
      cur += word
      spelled = true
      continue
    }
    // "o" / "oh" count as zero only when they sit inside a run of digits.
    if ((tok === 'o' || tok === 'oh') && (cur || /^[+]?\d/.test(tokens[i + 1] ?? '') || DIGIT_WORDS[tokens[i + 1] ?? ''])) {
      cur += '0'
      spelled = true
      continue
    }
    if (/^\+?[0-9o]+$/.test(tok) && /\d/.test(tok)) {
      cur += tok.replace(/o/g, '0').replace('+', '')
      if (/o/.test(tok)) spelled = true
      continue
    }
    flush()
  }
  flush()
  return runs
}

function looksLikePhone(run: { digits: string; spelled: boolean }): boolean {
  const d = run.digits
  if (/^(?:254|0)?[17]\d{8}$/.test(d)) return true // Kenyan mobile
  if (d.length >= 10) return true // any long number
  if (run.spelled && d.length >= 7) return true // spelled-out or disguised numbers
  return false
}

export function detectBlockedContent(input: string): BlockResult {
  const text = normalise(input)
  const reasons = new Set<BlockReason>()

  // Phone numbers, including spaced, spelled-out or disguised ones.
  if (digitRuns(text).some(looksLikePhone)) reasons.add('phone')

  // Links.
  if (/(?:https?:\/\/|ftp:\/\/|www\.)/.test(text)) reasons.add('link')
  const dot = '(?:\\.|\\s*\\(dot\\)\\s*|\\s*\\[dot\\]\\s*|\\s+dot\\s+)'
  if (new RegExp(`[a-z0-9][a-z0-9-]{1,61}${dot}(?:${STRONG_TLDS})\\b`).test(text)) reasons.add('link')
  if (new RegExp(`[a-z0-9][a-z0-9-]{1,61}${dot}(?:${WEAK_TLDS})(?=[/:?#])`).test(text)) reasons.add('link')
  if (/\b(?:wa\.me|t\.me|bit\.ly|tinyurl\.com|linktr\.ee|youtu\.be)\b/.test(text)) reasons.add('link')

  // Email addresses, including "name at gmail dot com".
  if (/[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\s+dot\s+)\s*[a-z]{2,}/.test(text)) {
    reasons.add('email')
  }
  if (/\b[a-z0-9._-]{3,}\s+at\s+(?:gmail|yahoo|outlook|hotmail|icloud|proton|protonmail)\b/.test(text)) reasons.add('email')

  // Social handles and "add me on <platform>".
  if (/(?:^|\s)@[a-z0-9_.]{3,}/.test(text)) reasons.add('handle')
  const platformRe = new RegExp(`\\b(?:${PLATFORMS})\\b`)
  if (platformRe.test(text)) {
    const sentences = text.split(/[.!?\n]+/)
    for (const s of sentences) {
      if (platformRe.test(s) && new RegExp(`(?:^|[^a-z])(?:${CONTACT_VERBS})(?:[^a-z]|$)`).test(s)) {
        reasons.add('handle')
        break
      }
    }
  }

  // Addresses and landmarks.
  const addr = [
    /\bp\.?\s?o\.?\s?box\s*\d+/,
    /\bpost(?:al)?\s+(?:box|code)\s*\d+/,
    /\b(?:plot|house|apartment|apt|flat)\s*(?:no\.?|number|#)?\s*\d+[a-z]?\b/,
    /\b\d{1,4}\s+[a-z]+(?:\s+[a-z]+)?\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|close|crescent)\b/,
    /\b(?:my|our)\s+address\s+(?:is|:)/,
    /\baddress\s*:/,
    /\b(?:opposite|behind|next to|near)\s+(?:the\s+)?[a-z]+(?:\s+[a-z]+){0,2}\s+(?:petrol station|supermarket|school|church|mall|stage|hospital|police station|junction|estate|apartments?|gate)\b/,
  ]
  if (addr.some((re) => re.test(text))) reasons.add('address')

  return { blocked: reasons.size > 0, reasons: [...reasons] }
}

/** Plain-language explanation for the person who tried to send it. */
export function explainBlock(reasons: BlockReason[]): string {
  const parts: string[] = []
  if (reasons.includes('phone')) parts.push('phone numbers')
  if (reasons.includes('link') || reasons.includes('handle') || reasons.includes('email')) parts.push('links and contact details')
  if (reasons.includes('address')) parts.push('addresses')
  const list = parts.length ? parts.join(', ') : 'contact details'
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} can’t be shared here. It keeps everyone anonymous.`
}

// ---------------------------------------------------------------------------
// 2. Identifying details in public posts (PRD FRM-3)
// ---------------------------------------------------------------------------

export type DetailKind = 'place' | 'workplace' | 'school' | 'name'
export interface IdentifyingDetail {
  kind: DetailKind
  text: string
}

const PLACES = [
  'nairobi', 'mombasa', 'kisumu', 'nakuru', 'eldoret', 'thika', 'kitale', 'malindi', 'nyeri', 'machakos', 'meru', 'embu',
  'garissa', 'kakamega', 'kisii', 'kericho', 'naivasha', 'nanyuki', 'lamu', 'kilifi', 'kitui', 'embakasi', 'kibera',
  'kasarani', 'westlands', 'karen', 'langata', 'kileleshwa', 'kilimani', 'ruaka', 'rongai', 'kikuyu', 'ngong', 'githurai',
  'roysambu', 'zimmerman', 'ruiru', 'juja', 'kiambu', 'bungoma', 'busia', 'homa bay', 'migori', 'siaya', 'narok', 'kajiado',
  'nyahururu', 'voi', 'diani', 'watamu', 'kapsabet', 'kabarnet', 'isiolo', 'marsabit', 'wajir', 'mandera', 'lodwar',
]

export function detectIdentifyingDetails(input: string): IdentifyingDetail[] {
  const found: IdentifyingDetail[] = []
  const seen = new Set<string>()
  const add = (kind: DetailKind, text: string) => {
    const key = `${kind}:${text.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      found.push({ kind, text: text.trim() })
    }
  }
  const lower = input.toLowerCase()
  for (const p of PLACES) {
    if (new RegExp(`(?:^|[^a-z])${p}(?:[^a-z]|$)`).test(lower)) add('place', p.replace(/\b\w/g, (c) => c.toUpperCase()))
  }
  const work =
    /\b(?:work(?:ing|s|ed)?\s+(?:at|for)|job\s+at|employed\s+(?:at|by)|intern(?:ing)?\s+at)\s+([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,3})/g
  for (const m of input.matchAll(work)) add('workplace', m[1])
  const school =
    /\b(University of [A-Z][a-z]+|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s(?:University|College|Secondary School|High School|Primary School|Academy))\b/g
  for (const m of input.matchAll(school)) add('school', m[1])
  const name = /\b(?:my name is|i am called|i'm called|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi
  for (const m of input.matchAll(name)) add('name', m[1])
  return found
}
export function describeDetail(d: IdentifyingDetail): string {
  const label = { place: 'place', workplace: 'workplace', school: 'school', name: 'name' }[d.kind]
  return `${d.text} (${label})`
}

// ---------------------------------------------------------------------------
// 3. Distress signals (PRD CRS-3). Baseline keywords, never punitive.
// ---------------------------------------------------------------------------

export type DistressLevel = 'none' | 'possible' | 'high'

const HIGH = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'end it all', 'want to die', "don't want to live", 'do not want to live',
  'better off dead', 'hurt myself', 'harm myself', 'self harm', 'self-harm', 'cutting myself', 'overdose',
  'no reason to live', 'take my own life',
  'kujiua', 'nijiue', 'nataka kufa', 'sitaki kuishi', 'nimechoka na maisha',
]
const POSSIBLE = ["can't go on", 'cannot go on', "can't do this anymore", 'cant do this anymore', 'hopeless', 'give up on life', 'no point', 'nothing matters']

export function detectDistress(input: string): { level: DistressLevel; matches: string[] } {
  const text = normalise(input).replace(/[’‘]/g, "'")
  const high = HIGH.filter((k) => text.includes(k))
  if (high.length) return { level: 'high', matches: high }
  const possible = POSSIBLE.filter((k) => text.includes(k))
  if (possible.length) return { level: 'possible', matches: possible }
  return { level: 'none', matches: [] }
}

// ---------------------------------------------------------------------------
// 4. Pen names (PRD PRF-1, PRF-9)
// ---------------------------------------------------------------------------

const NAMES = new Set(
  (
    'amina james grace peter mary john faith joseph esther daniel david brian kevin mercy lucy ann anne jane janet alice ' +
    'beatrice caroline dennis eric felix george hellen ian jackline joyce kelvin linda martin nancy paul rose samuel sarah ' +
    'stephen susan tom victor wanjiru wambui njeri akinyi achieng atieno otieno odhiambo ochieng mwangi kamau kariuki mutua ' +
    'musyoka wafula barasa kipchoge kiprop chebet jepkoech mohamed hassan fatuma zainab halima ali omar omondi onyango ' +
    'kimani maina githinji waweru korir cheruiyot abdi hussein njoroge wekesa kiplagat naomi purity winnie vivian ruth ' +
    'margaret elizabeth patrick simon francis moses isaac collins elvis emmanuel michael robert charles'
  ).split(' '),
)
const RESERVED = ['admin', 'echo', 'moderator', 'support', 'therapist', 'official', 'staff', 'doctor', 'dr']

export type PenNameProblem = 'length' | 'characters' | 'contact' | 'real-name' | 'reserved'

export function validatePenName(raw: string): { ok: true } | { ok: false; problem: PenNameProblem; message: string } {
  const name = raw.trim()
  if (name.length < 3 || name.length > 20) {
    return { ok: false, problem: 'length', message: 'Use 3 to 20 letters or numbers.' }
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    return { ok: false, problem: 'characters', message: 'Use letters and numbers only, with no spaces, like QuietPine.' }
  }
  if (detectBlockedContent(name).blocked) {
    return { ok: false, problem: 'contact', message: 'A pen name can’t contain contact details or links.' }
  }
  const lower = name.toLowerCase()
  if (/_(com|org|net|app|io|co|ke)$/.test(lower)) {
    return { ok: false, problem: 'contact', message: 'A pen name can’t contain contact details or links.' }
  }
  if (RESERVED.some((r) => lower === r || lower.startsWith(r + '_') || lower.endsWith('_' + r))) {
    return { ok: false, problem: 'reserved', message: 'That name is reserved. Try something else.' }
  }
  const parts = (name.match(/[A-Z][a-z]+|[a-z]+/g) ?? []).map((p) => p.toLowerCase())
  const wholeNoDigits = lower.replace(/[0-9_]+$/g, '')
  const nameParts = parts.filter((p) => NAMES.has(p))
  if (NAMES.has(wholeNoDigits) || nameParts.length >= 2 || (parts.length === 1 && NAMES.has(parts[0]))) {
    return { ok: false, problem: 'real-name', message: 'This looks like a real name. Try something that isn’t you.' }
  }
  return { ok: true }
}

const ADJ = ['Quiet', 'Gentle', 'Calm', 'Brave', 'Bright', 'Soft', 'Still', 'Warm', 'Kind', 'Steady', 'Misty', 'Golden', 'Silver', 'Rainy', 'Sunny', 'Lucky', 'Patient', 'Hopeful', 'Morning', 'Wandering']
const NOUN = ['Pine', 'River', 'Leaf', 'Owl', 'Heron', 'Moon', 'Meadow', 'Fern', 'Cloud', 'Pebble', 'Harbor', 'Acacia', 'Baobab', 'Lake', 'Breeze', 'Willow', 'Sparrow', 'Dune', 'Ember', 'Reed']

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function suggestPenNames(seed: number, count = 3): string[] {
  const rnd = mulberry32(seed)
  const out = new Set<string>()
  let guard = 0
  while (out.size < count && guard++ < 50) {
    const n = `${ADJ[Math.floor(rnd() * ADJ.length)]}${NOUN[Math.floor(rnd() * NOUN.length)]}`
    if (validatePenName(n).ok) out.add(n)
  }
  return [...out]
}
