import type { ScriptParameterDefinition } from '../../shared/crypto/script-execution'

export type ScriptParameterType = ScriptParameterDefinition['type']

export interface ScriptParameterDraft {
  id: string
  name: string
  description: string
  type: ScriptParameterType
  required: boolean
  allowedValues: string
}

export type ScriptParameterValidationError =
  | 'count'
  | 'name'
  | 'reserved'
  | 'duplicate'
  | 'description'
  | 'allowedValues'

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])

export function validateScriptParameterDrafts(
  parameters: readonly ScriptParameterDraft[],
): ScriptParameterValidationError | null {
  if (parameters.length > 32) return 'count'
  const names = new Set<string>()
  for (const parameter of parameters) {
    const name = parameter.name.trim()
    const folded = name.toLocaleLowerCase('en-US')
    if (!NAME.test(name) || name.length > 64) return 'name'
    if (RESERVED.has(folded) || folded.startsWith('palladin_')) return 'reserved'
    if (names.has(folded)) return 'duplicate'
    names.add(folded)
    if (!parameter.description.trim() || parameter.description.length > 1024) return 'description'
    try {
      parseAllowedValues(parameter)
    } catch {
      return 'allowedValues'
    }
  }
  return null
}

export function buildScriptParameterDefinitions(
  drafts: readonly ScriptParameterDraft[],
): ScriptParameterDefinition[] {
  const error = validateScriptParameterDrafts(drafts)
  if (error) throw new Error(`Invalid Script parameter definitions: ${error}`)
  return drafts.map((draft) => {
    const common = {
      name: draft.name.trim().normalize('NFC'),
      description: draft.description.trim().normalize('NFC'),
      required: draft.required,
    }
    const values = parseAllowedValues(draft)
    if (draft.type === 'string') return {
      ...common,
      type: 'string' as const,
      ...(values.length > 0 ? { enum: values as string[] } : {}),
    }
    if (draft.type === 'integer') return {
      ...common,
      type: 'integer' as const,
      ...(values.length > 0 ? { enum: values as number[] } : {}),
    }
    if (draft.type === 'number') return {
      ...common,
      type: 'number' as const,
      ...(values.length > 0 ? { enum: values as number[] } : {}),
    }
    return {
      ...common,
      type: 'boolean' as const,
      ...(values.length > 0 ? { enum: values as boolean[] } : {}),
    }
  })
}

export function scriptParameterDrafts(
  definitions: readonly ScriptParameterDefinition[] | undefined,
): ScriptParameterDraft[] {
  return (definitions ?? []).map((definition) => ({
    id: crypto.randomUUID(),
    name: definition.name,
    description: definition.description,
    type: definition.type,
    required: definition.required,
    allowedValues: definition.enum?.map(String).join(', ') ?? '',
  }))
}

function parseAllowedValues(
  parameter: Pick<ScriptParameterDraft, 'type' | 'allowedValues'>,
): Array<string | number | boolean> {
  const tokens = parameter.allowedValues.split(',').map((value) => value.trim()).filter(Boolean)
  if (tokens.length === 0) return []
  const values = tokens.map((token) => {
    if (parameter.type === 'string') return token.normalize('NFC')
    if (parameter.type === 'boolean') {
      if (token !== 'true' && token !== 'false') throw new Error('Boolean allowed values must be true or false')
      return token === 'true'
    }
    const value = Number(token)
    if (!Number.isFinite(value) || (parameter.type === 'integer' && !Number.isSafeInteger(value))) {
      throw new Error('Allowed value does not match its parameter type')
    }
    return value
  })
  if (new Set(values.map((value) => JSON.stringify(value))).size !== values.length) {
    throw new Error('Allowed values must be unique')
  }
  return values
}
