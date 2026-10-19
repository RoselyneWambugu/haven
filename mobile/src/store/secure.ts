import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

/**
 * Secrets such as the signed-in flag go in the phone's secure storage (Keychain
 * or Keystore). The web build has no secure storage, so it falls back to local
 * storage, which is fine for a demo and not for production.
 */
export const secure = {
  async get(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return await AsyncStorage.getItem(`secure:${key}`)
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') await AsyncStorage.setItem(`secure:${key}`, value)
      else await SecureStore.setItemAsync(key, value)
    } catch {
      /* ignore: the user simply signs in again */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') await AsyncStorage.removeItem(`secure:${key}`)
      else await SecureStore.deleteItemAsync(key)
    } catch {
      /* ignore */
    }
  },
}
