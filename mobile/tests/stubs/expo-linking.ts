/** Stand-in for expo-linking: just enough to build and read the sign-in return address. */
export const createURL = (path: string): string => `exp://test.host/--/${path}`
export function parse(url: string): { queryParams: Record<string, string> } {
  const q = url.split('?')[1] ?? ''
  return { queryParams: Object.fromEntries(new URLSearchParams(q.split('#')[0])) }
}
