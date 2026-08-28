import { isAllowedScriptReferenceEnvName } from '../../shared/crypto/script-execution'
import type { ScriptRef } from './types'

export function isScriptReferenceFieldSelectable(
  policy: { fields: Record<string, string> },
  fieldId: string,
): boolean {
  const access = policy.fields[fieldId]
  return access !== undefined && access !== 'never'
}

export function validateScriptRefs(refs: readonly ScriptRef[], vaultId: string): boolean {
  if (refs.length > 64) return false
  const names = new Set<string>()
  for (const ref of refs) {
    const folded = ref.env.toLocaleLowerCase('en-US')
    if (!isAllowedScriptReferenceEnvName(ref.env) || names.has(folded)
      || ref.vaultId !== vaultId || !ref.entryId || !ref.field) return false
    names.add(folded)
  }
  return true
}
