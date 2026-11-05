/** Stand-in for expo-web-browser. A test sets `browser.result` to what the person did in the Google window. */
export const browser: { result: { type: 'success'; url: string } | { type: 'cancel' }; opened: string[] } = { result: { type: 'cancel' }, opened: [] }
export const maybeCompleteAuthSession = (): void => undefined
export async function openAuthSessionAsync(url: string): Promise<{ type: 'success'; url: string } | { type: 'cancel' }> {
  browser.opened.push(url)
  return browser.result
}
