import '@testing-library/jest-dom/vitest'
import '../shared/lib/i18n'

// Node 26 exposes an experimental global `localStorage` getter that resolves
// to undefined unless the process receives a file flag. It shadows jsdom's
// storage in Vitest workers, so provide the browser-compatible in-memory
// implementation tests actually require.
const storageValues = new Map<string, string>()
const testLocalStorage: Storage = {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(String(key)) ?? null,
  key: (index) => Array.from(storageValues.keys())[index] ?? null,
  removeItem: (key) => { storageValues.delete(String(key)) },
  setItem: (key, value) => { storageValues.set(String(key), String(value)) },
}
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
})

// jsdom has no Web Locks; model exclusive origin-wide serialization for session tests.
if (!navigator.locks) {
  const queues = new Map<string, Promise<unknown>>()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request(name: string, optionsOrCallback: unknown, callback?: (lock: object) => unknown) {
      const run = (callback ?? optionsOrCallback) as (lock: object) => unknown
      const result = (queues.get(name) ?? Promise.resolve()).catch(() => undefined)
        .then(() => run({ name, mode: 'exclusive' }))
      queues.set(name, result)
      return result
    },
  } })
}
