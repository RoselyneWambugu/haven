/** The rules a new password must meet, checked before it is sent. Supabase has its own minimum; this is the stricter one the app asks for. */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export const validEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/** Null when the password is acceptable, otherwise a plain reason. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`
  if (/^(.)\1+$/.test(password)) return 'Use more than one repeated character.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.'
  const e = email.trim().toLowerCase()
  if (e && (password.toLowerCase() === e || password.toLowerCase() === e.split('@')[0])) return 'Don’t use your email as your password.'
  return null
}
