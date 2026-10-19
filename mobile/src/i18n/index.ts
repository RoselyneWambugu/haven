import { useDb } from '@/store/db'
import { sw } from './sw'

type Vars = Record<string, string | number>

/** English text is the key. Missing translations fall back to English, so the app never shows a blank. */
export function translate(lang: 'en' | 'sw', key: string, vars?: Vars): string {
  let out = lang === 'sw' ? (sw[key] ?? key) : key
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

export function useT(): (key: string, vars?: Vars) => string {
  const lang = useDb((s) => s.account?.settings.language ?? 'en')
  return (key, vars) => translate(lang, key, vars)
}
