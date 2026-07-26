import { useTranslation } from 'react-i18next'
import { FormSelect } from '../../../shared/components/form-select'
import {
  allowedAgentFieldAccess,
  ENTRY_FIELD,
  type AgentFieldAccess,
  type AgentVisibilityPolicy,
} from '../../../shared/crypto/vault-v2-entry'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type CustomField,
  type EntryType,
} from '../types'
import { SectionHeader } from './section-header'

interface AgentVisibilityPolicyEditorProps {
  type: EntryType
  customFields: CustomField[]
  policy: AgentVisibilityPolicy
  disabled: boolean
  onChange: (policy: AgentVisibilityPolicy) => void
}

interface PolicyField {
  id: string
  label: string
  customType?: CustomField['type']
}

const ACCESS_LABELS: Record<AgentFieldAccess, string> = {
  never: 'vault.entries.visibility.never',
  discovery: 'vault.entries.visibility.discovery',
  onGrantValue: 'vault.entries.visibility.onGrantValue',
  onGrantDerived: 'vault.entries.visibility.onGrantDerived',
  onGrantRuntime: 'vault.entries.visibility.onGrantRuntime',
}

export function AgentVisibilityPolicyEditor({
  type,
  customFields,
  policy,
  disabled,
  onChange,
}: AgentVisibilityPolicyEditorProps) {
  const { t } = useTranslation()
  const fields = policyFields(type, customFields, t)

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>{t('vault.entries.visibility.title')}</SectionHeader>
      <p className="text-micro text-[var(--cv-t3)]">
        {t('vault.entries.visibility.description')}
      </p>
      <FormSelect
        id="entry-discoverable"
        label={t('vault.entries.visibility.entryDiscovery')}
        value={policy.discoverable ? 'enabled' : 'disabled'}
        onChange={(event) => {
          const discoverable = event.target.value === 'enabled'
          onChange({
            discoverable,
            fields: {
              ...policy.fields,
              [ENTRY_FIELD.agentLabel]: discoverable ? 'discovery' : 'never',
            },
          })
        }}
        disabled={disabled}
      >
        <option value="enabled">{t('vault.entries.visibility.enabled')}</option>
        <option value="disabled">{t('vault.entries.visibility.disabled')}</option>
      </FormSelect>
      {fields.map((field) => (
        <FormSelect
          key={field.id}
          id={`entry-policy-${field.id.replace(/[^a-z0-9-]/gi, '-')}`}
          label={t('vault.entries.visibility.fieldAccess', { field: field.label })}
          value={policy.fields[field.id] ?? 'never'}
          onChange={(event) => onChange({
            ...policy,
            fields: { ...policy.fields, [field.id]: event.target.value as AgentFieldAccess },
          })}
          disabled={disabled || (!policy.discoverable && field.id === ENTRY_FIELD.agentLabel)}
        >
          {allowedAgentFieldAccess(type, field.id, field.customType).map((access) => (
            <option key={access} value={access}>{t(ACCESS_LABELS[access])}</option>
          ))}
        </FormSelect>
      ))}
    </div>
  )
}

function policyFields(
  type: EntryType,
  customFields: CustomField[],
  t: (key: string, options?: Record<string, unknown>) => string,
): PolicyField[] {
  const common = [
    { id: ENTRY_FIELD.agentLabel, labelKey: 'vault.entries.visibility.agentLabel' },
    { id: ENTRY_FIELD.description, labelKey: 'vault.entries.descriptionLabel' },
    { id: ENTRY_FIELD.notes, labelKey: 'vault.entries.notesLabel' },
  ]
  const typed = type === ENTRY_TYPE_KEY
    ? [{ id: ENTRY_FIELD.value, labelKey: 'vault.entries.valueLabel' }]
    : type === ENTRY_TYPE_CREDENTIAL
      ? [
          { id: ENTRY_FIELD.username, labelKey: 'vault.entries.usernameLabel' },
          { id: ENTRY_FIELD.urlDomain, labelKey: 'vault.entries.visibility.urlDomain' },
          { id: ENTRY_FIELD.url, labelKey: 'vault.entries.urlLabel' },
          { id: ENTRY_FIELD.password, labelKey: 'vault.entries.passwordLabel' },
          { id: ENTRY_FIELD.totp, labelKey: 'vault.entries.visibility.totp' },
        ]
      : [
          { id: ENTRY_FIELD.interpreter, labelKey: 'vault.entries.script.interpreterLabel' },
          { id: ENTRY_FIELD.script, labelKey: 'vault.entries.script.bodyLabel' },
          { id: ENTRY_FIELD.refs, labelKey: 'vault.entries.script.refsTitle' },
        ]
  return [
    ...[...common, ...typed].map((field): PolicyField => ({ id: field.id, label: t(field.labelKey) })),
    ...customFields.map((field): PolicyField => ({
      id: `custom:${field.id}`,
      label: field.label || t('vault.entries.visibility.unnamedCustomField'),
      customType: field.type,
    })),
  ]
}
