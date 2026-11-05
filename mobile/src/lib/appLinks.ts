/**
 * Where to download the Echo mobile app. Set EXPO_PUBLIC_ANDROID_APP_URL and EXPO_PUBLIC_IOS_APP_URL (Google Play and App Store addresses)
 * on the website. Until the app is in the stores they are empty, and the download buttons lead to a page that says so.
 */
export const ANDROID_APP_URL = (process.env.EXPO_PUBLIC_ANDROID_APP_URL ?? '').trim()
export const IOS_APP_URL = (process.env.EXPO_PUBLIC_IOS_APP_URL ?? '').trim()
export const APP_IN_STORES = ANDROID_APP_URL !== '' || IOS_APP_URL !== ''
