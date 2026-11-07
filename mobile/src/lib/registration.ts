import type { RegistrationDraft } from '@/store/db'

/**
 * Where to carry on with sign-up, for someone who is signed in but has no Echo profile yet. The steps are:
 * 1 your details, 2 confirm your email, 3 pen name, 4 languages, 5 terms. If the details are already filled in (they were typed before the email
 * was confirmed), go on to the pen name. Otherwise start at the details.
 */
export function registrationRoute(reg: Pick<RegistrationDraft, 'fullName' | 'dob'> | null | undefined): '/pen-name' | '/register' {
  return reg && reg.fullName.trim() && reg.dob ? '/pen-name' : '/register'
}
