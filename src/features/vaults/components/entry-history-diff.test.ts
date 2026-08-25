import { describe, expect, it } from 'vitest'
import type { MemberSecretView } from '../../../shared/crypto/entry-draft'
import { compareEntryVersionToCurrent } from './entry-history-diff'

const historical: MemberSecretView = {
  memberLabel: 'Old label',
  agentLabel: 'Shared label',
  description: 'Old description',
  iconReference: 'builtin:key',
  color: '#EB4747',
  entryType: 0,
  content: {
    type: 0,
    value: 'old-secret',
    url: 'https://old.example.com',
    notes: 'Same notes',
    fields: [
      { id: 'same', label: 'Same', type: 'text', value: 'same' },
      { id: 'changed', label: 'Region', type: 'text', value: 'eu' },
    ],
  },
  agentVisibilityPolicy: { discoverable: false, fields: { value: 'onGrantValue' } },
}

describe('compareEntryVersionToCurrent', () => {
  it('marks only visible values that differ from the current version', () => {
    const current: MemberSecretView = {
      ...historical,
      memberLabel: 'Current label',
      description: 'Current description',
      content: {
        ...historical.content,
        value: 'current-secret',
        url: 'https://current.example.com',
        fields: [
          { id: 'same', label: 'Same', type: 'text', value: 'same' },
          { id: 'changed', label: 'Region', type: 'text', value: 'us' },
        ],
      },
    }

    const result = compareEntryVersionToCurrent(historical, current)

    expect([...result.fields]).toEqual([
      'memberLabel', 'description', 'url', 'value', 'customFields',
    ])
    expect([...result.customFieldIds]).toEqual(['changed'])
    expect(result.hasChanges).toBe(true)
  })

  it('does not depend on object key insertion order', () => {
    const current: MemberSecretView = {
      ...historical,
      agentVisibilityPolicy: { discoverable: false, fields: { value: 'onGrantValue' } },
    }

    expect(compareEntryVersionToCurrent(historical, current).hasChanges).toBe(false)
  })
})
