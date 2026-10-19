/**
 * Things that are still open decisions in the PRD. Keeping them here means the
 * app never hard-codes an answer that has not been made.
 */
export const CONFIG = {
  /** D2 and D3: until prices are decided the app shows "KES ___". The demo screen can show sample amounts. */
  pricesDecided: false,
  /** D26: days chats stay read-only after a plan lapses. */
  graceDays: 7,
  /** D34: days an account is held after a deletion request. */
  deletionHoldDays: 14,
  /** D36: days between pen-name changes (the first change is free). */
  penNameChangeDays: 30,
  /** Crisis numbers must be verified by the clinical team (D29) before launch. */
  crisisLinesVerified: false,
  otpLength: 6,
  otpMaxAttempts: 5,
  otpLockMinutes: 15,
} as const
