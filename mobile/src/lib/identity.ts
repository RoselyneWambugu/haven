/** Phone numbers, dates of birth and age bands (PRD ACC-1 to ACC-3, ACC-9). */

/** Accepts 0712 345 678, +254 712 345 678, 254712345678 or 712345678 and returns +254712345678. */
export function normaliseKenyanPhone(input: string): string | null {
  const stripped = input.replace(/[\s\-().]/g, '')
  const m = /^(?:\+?254|0)?([17]\d{8})$/.exec(stripped)
  return m ? `+254${m[1]}` : null
}

/** "+254712345678" becomes "+254 712 ••• 678". */
export function maskPhone(e164: string): string {
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164)
  return m ? `+254 ${m[1]} ••• ${m[3]}` : e164
}

/** "amina.otieno@gmail.com" becomes "am•••••@gmail.com". A phone number is masked as a phone number. */
export function maskContact(v: string): string {
  const at = v.indexOf('@')
  if (at < 1) return maskPhone(v)
  const name = v.slice(0, at)
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(3, Math.min(6, name.length - 2)))}${v.slice(at)}`
}

export function formatPhone(e164: string): string {
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164)
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : e164
}

/** Parses DD/MM/YYYY (also accepts - or . separators). Returns null when it isn't a real date. */
export function parseDob(input: string): Date | null {
  const m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(input.trim())
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  if (y < 1900) return null
  return date
}

const two = (n: number) => String(n).padStart(2, '0')

/** "14/03/1998" becomes "1998-03-14" (what a browser's date box uses). An unreadable date becomes "". */
export function dobToIso(input: string): string {
  const d = parseDob(input)
  return d ? `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}` : ''
}

/** "1998-03-14" becomes "14/03/1998". */
export function isoToDob(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** A date picked on a phone (its local calendar day) as "14/03/1998". */
export function dateToDob(d: Date): string {
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function ageOn(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

export const MIN_AGE = 18

export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55+'

export function ageBand(age: number): AgeBand | null {
  if (age < MIN_AGE) return null
  if (age <= 24) return '18-24'
  if (age <= 34) return '25-34'
  if (age <= 44) return '35-44'
  if (age <= 54) return '45-54'
  return '55+'
}

export function ageBandLabel(band: AgeBand): string {
  return band === '55+' ? '55 and over' : band.replace('-', ' to ')
}

/** Adjacent bands, used when nobody in the exact band is available. Adults only. */
export function neighbouringBands(band: AgeBand): AgeBand[] {
  const order: AgeBand[] = ['18-24', '25-34', '35-44', '45-54', '55+']
  const i = order.indexOf(band)
  return order.filter((_, j) => Math.abs(i - j) === 1)
}

/**
 * Checks an edit to the real name and contact email. Returns a plain reason, or null when it is fine.
 * A pen name can't contain a part of the real name, and an email that is how the member signs in is changed under Sign-in methods.
 */
export function validateDetailsEdit(
  input: { fullName: string; email: string },
  current: { fullName: string; email: string; penName: string; emailIsSignIn: boolean },
): string | null {
  const name = input.fullName.trim()
  if (name.length < 2) return 'Enter your full name.'
  if (name.length > 120) return 'Keep your name under 120 characters.'
  const email = input.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email doesn’t look right. You can leave it blank.'
  if (current.emailIsSignIn && email.toLowerCase() !== current.email.toLowerCase()) return 'Your email is how you sign in. Change it under Sign-in methods.'
  if (name !== current.fullName) {
    const pen = current.penName.toLowerCase()
    const parts = name.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/)
    if (parts.some((p) => p.length >= 3 && pen.includes(p))) return 'Part of that name is in your pen name. Change your pen name first, then update your name.'
  }
  return null
}
