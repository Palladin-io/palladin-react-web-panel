import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentSetupDescriptor,
  createFriendlyAgentName,
  normalizeAgentMetadata,
  agentProfileId,
} from './pairing-metadata'

describe('agentProfileId', () => {
  it.each([
    ['Bursztynowy Lis', 'bursztynowy-lis'],
    ['Żółty Łabędź', 'zolty-labedz'],
    ['John', 'john'],
    ['CON', 'agent-con'],
    ['--x; $(id) / ../', 'x-id'],
    ['!!!', null],
  ])('derives a shell-safe runtime profile from %s', (name, expected) => {
    expect(agentProfileId(name)).toBe(expected)
  })
})

function decodeDescriptor(descriptor: string): unknown {
  const encoded = descriptor.split(':', 2)[1]
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  return JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
  ))
}

describe('pairing metadata', () => {
  afterEach(() => vi.restoreAllMocks())

  it('encodes the optional name only as canonical descriptor data', () => {
    const descriptor = createAgentSetupDescriptor('  Bursztynowy Lis  ')
    expect(descriptor).toMatch(/^PALLADIN_AGENT_SETUP_V1:[A-Za-z0-9_-]+$/u)
    expect(decodeDescriptor(descriptor)).toEqual({
      v: 1,
      userPreferredDisplayName: 'Bursztynowy Lis',
    })
    expect(decodeDescriptor(createAgentSetupDescriptor(''))).toEqual({ v: 1 })
  })

  it('normalizes NFC and rejects control, bidi and overlong metadata', () => {
    expect(normalizeAgentMetadata(' Cafe\u0301 ', 64)).toBe('Café')
    expect(normalizeAgentMetadata('safe\u202eunsafe', 64)).toBeNull()
    expect(normalizeAgentMetadata('a'.repeat(65), 64)).toBeNull()
  })

  it.each([
    ['pl', 'Bursztynowy Lis'],
    ['en', 'Amber Fox'],
  ])('uses the localized human-friendly dictionary for %s', (language, expected) => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = 0
      return array
    })
    const name = createFriendlyAgentName(language)
    expect(name).toBe(expected)
    expect(name).not.toMatch(/agent|codex|\d|[-_][a-z0-9]+$/iu)
  })

  it('does not retry an excluded colliding candidate', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = 0
      return array
    })

    expect(createFriendlyAgentName('en', new Set(['Amber Fox']))).toBe('Calm Otter')
  })
})
