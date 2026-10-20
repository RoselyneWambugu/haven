import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// Tests cover plain TypeScript logic and the mock API. esbuild gets its own minimal
// settings, and the native modules are replaced by small stand-ins.
export default defineConfig({
  esbuild: { tsconfigRaw: { compilerOptions: { target: 'es2020', strict: true } } },
  resolve: {
    alias: {
      '@/': p('./src/'),
      '@react-native-async-storage/async-storage': p('./tests/stubs/async-storage.ts'),
      'react-native': p('./tests/stubs/react-native.ts'),
      'expo-secure-store': p('./tests/stubs/secure-store.ts'),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
