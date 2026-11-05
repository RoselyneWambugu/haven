import { Platform } from 'react-native'
import { REMOTE } from '@/backend/client'

/**
 * Members use the mobile app. On the hosted website (the live service, in a browser) only therapists and staff sign in, so the
 * member sign-in, registration and member screens are not offered there. The demo build keeps everything so it can be tried in a browser.
 */
export const MEMBERS_ON_WEB = !(REMOTE && Platform.OS === 'web')

/** The first part of an address that the website still serves when members are not offered. */
export const WEB_PAGES = new Set(['portal', 'admin', 'landing', 'about', 'urgent', 'mobile-app', 'auth-callback', 'login-email', 'signup-email', 'forgot-password', 'reset-password', 'settings', 'help', 'recovery'])
