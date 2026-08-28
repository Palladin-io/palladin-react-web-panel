import { describe, expect, it } from 'vitest'

import {
  buildScriptParameterDefinitions,
  scriptParameterDrafts,
  validateScriptParameterDrafts,
  type ScriptParameterDraft,
} from '../script-parameters'

function parameter(patch: Partial<ScriptParameterDraft> = {}): ScriptParameterDraft {
  return {
    id: crypto.randomUUID(),
    name: 'TEAM',
    description: 'Team slug',
    type: 'string',
    required: true,
    allowedValues: '["core", "platform"]',
    ...patch,
  }
}

describe('Script parameter contract editor', () => {
  it('builds typed definitions without sending values to the backend', () => {
    const definitions = buildScriptParameterDefinitions([
      parameter(),
      parameter({ name: 'LIMIT', description: 'Maximum rows', type: 'integer', allowedValues: '[10, 50]' }),
      parameter({ name: 'VERBOSE', description: 'Verbose output', type: 'boolean', allowedValues: '[true, false]' }),
    ])
    expect(definitions).toEqual([
      { name: 'TEAM', description: 'Team slug', type: 'string', required: true, enum: ['core', 'platform'] },
      { name: 'LIMIT', description: 'Maximum rows', type: 'integer', required: true, enum: [10, 50] },
      { name: 'VERBOSE', description: 'Verbose output', type: 'boolean', required: true, enum: [true, false] },
    ])
    expect(definitions).not.toHaveProperty('value')
    expect(scriptParameterDrafts(definitions).map((draft) => ({
      name: draft.name,
      description: draft.description,
      type: draft.type,
      required: draft.required,
      allowedValues: draft.allowedValues,
    }))).toEqual([
      { name: 'TEAM', description: 'Team slug', type: 'string', required: true, allowedValues: '["core","platform"]' },
      { name: 'LIMIT', description: 'Maximum rows', type: 'integer', required: true, allowedValues: '[10,50]' },
      { name: 'VERBOSE', description: 'Verbose output', type: 'boolean', required: true, allowedValues: '[true,false]' },
    ])
  })

  it('rejects case-insensitive duplicates, reserved names and invalid typed enums', () => {
    expect(validateScriptParameterDrafts([parameter(), parameter({ name: 'team' })])).toBe('duplicate')
    expect(validateScriptParameterDrafts([parameter({ name: 'PALLADIN_TOKEN' })])).toBe('reserved')
    expect(validateScriptParameterDrafts([parameter({ type: 'integer', allowedValues: '[1.5]' })])).toBe('allowedValues')
    expect(validateScriptParameterDrafts([parameter({ type: 'boolean', allowedValues: '["yes"]' })])).toBe('allowedValues')
  })

  it('losslessly round-trips string enum values containing commas, whitespace and empty text', () => {
    const definition = {
      name: 'FILTER',
      description: 'Exact filter',
      type: 'string' as const,
      required: false,
      enum: ['a,b', ' leading', 'trailing ', ''],
    }

    const [draft] = scriptParameterDrafts([definition])
    expect(draft.allowedValues).toBe('["a,b"," leading","trailing ",""]')
    expect(buildScriptParameterDefinitions([draft])).toEqual([definition])
  })
})
