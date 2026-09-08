import { describe, expect, it } from 'vitest'
import { canPairAgent, PERMISSION_AGENT_MANAGE as manage, PERMISSION_READ_API_KEY as read, PERMISSION_WRITE_API_KEY as write } from './permissions'

describe('pairing entry permissions', () => {
  it.each([
    [0, false], [manage, false], [read, false], [write, false], [read | write, false],
    [manage | read, true], [manage | write, true], [manage | read | write, true],
  ])('gates Agents, Add Agent, approval and onboarding for mask %s', (permissions, expected) => {
    expect(canPairAgent(permissions)).toBe(expected)
  })
})
