type Vars = Record<string, string | number>

/** The app is in English only. Text goes through here so {placeholders} are filled in one place. */
export function translate(key: string, vars?: Vars): string {
  let out = key
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

export function useT(): (key: string, vars?: Vars) => string {
  return translate
}
