/**
 * The email and password someone has just signed up with, kept in memory only so "I've confirmed it" can sign them in once they open the link in
 * their email. It is never saved to the device and is gone when the app closes (then they log in with their email instead).
 */
let pending: { email: string; password: string } | null = null

export const setPendingSignup = (email: string, password: string): void => {
  pending = { email: email.trim(), password }
}
export const getPendingSignup = (): { email: string; password: string } | null => pending
export const clearPendingSignup = (): void => {
  pending = null
}
