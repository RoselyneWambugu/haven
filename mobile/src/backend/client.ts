import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** True when the app should talk to Supabase instead of the on-device mock. */
export const REMOTE = process.env.EXPO_PUBLIC_BACKEND === 'supabase'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL
    const key = process.env.EXPO_PUBLIC_SUPABASE_KEY
    if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (see .env.example).')
    client = createClient(url, key, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  }
  return client
}

/** Lets tests replace the client with a fake. */
export function setClient(c: SupabaseClient | null): void {
  client = c
}
