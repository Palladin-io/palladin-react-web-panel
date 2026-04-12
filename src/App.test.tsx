import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('is a valid React component', () => {
    expect(App).toBeDefined()
    expect(typeof App).toBe('function')
  })
})
