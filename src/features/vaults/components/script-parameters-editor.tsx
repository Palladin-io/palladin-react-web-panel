import { useTranslation } from 'react-i18next'

import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { Icon } from '../../../shared/components/icon'
import type {
  ScriptParameterDraft,
  ScriptParameterType,
  ScriptParameterValidationError,
} from '../script-parameters'

export function ScriptParametersEditor({
  parameters,
  onChange,
  disabled,
  error,
}: {
  parameters: ScriptParameterDraft[]
  onChange: (parameters: ScriptParameterDraft[]) => void
  disabled?: boolean
  error?: ScriptParameterValidationError | null
}) {
  const { t } = useTranslation()
  const update = (id: string, patch: Partial<ScriptParameterDraft>) => {
    onChange(parameters.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter))
  }

  return (
    <div className="flex flex-col gap-2">
      {parameters.map((parameter, index) => (
        <div
          key={parameter.id}
          className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3"
        >
          <div className="grid grid-cols-[1fr_9rem_auto] gap-2">
            <FormInput
              id={`script-parameter-name-${parameter.id}`}
              label={t('vault.entries.script.parameterName')}
              value={parameter.name}
              onChange={(event) => update(parameter.id, { name: event.target.value })}
              placeholder="limit"
              disabled={disabled}
              maxLength={64}
              autoComplete="off"
              error={Boolean(error)}
            />
            <FormSelect
              id={`script-parameter-type-${parameter.id}`}
              label={t('vault.entries.script.parameterType')}
              value={parameter.type}
              onChange={(event) => update(parameter.id, {
                type: event.target.value as ScriptParameterType,
                allowedValues: '',
              })}
              disabled={disabled}
            >
              <option value="string">{t('vault.entries.script.parameterTypeString')}</option>
              <option value="integer">{t('vault.entries.script.parameterTypeInteger')}</option>
              <option value="number">{t('vault.entries.script.parameterTypeNumber')}</option>
              <option value="boolean">{t('vault.entries.script.parameterTypeBoolean')}</option>
            </FormSelect>
            <button
              type="button"
              aria-label={t('vault.entries.script.removeParameter', { index: index + 1 })}
              onClick={() => onChange(parameters.filter((candidate) => candidate.id !== parameter.id))}
              disabled={disabled}
              className="mt-6 flex h-control w-11 items-center justify-center rounded-lg text-[var(--cv-primary)]
                transition-colors hover:bg-[rgb(var(--cv-primary-rgb)/0.08)] disabled:opacity-40"
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <FormInput
              id={`script-parameter-description-${parameter.id}`}
              label={t('vault.entries.script.parameterDescription')}
              value={parameter.description}
              onChange={(event) => update(parameter.id, { description: event.target.value })}
              disabled={disabled}
              maxLength={1024}
              autoComplete="off"
              error={Boolean(error)}
            />
            <label className="mt-6 flex h-control items-center gap-2 text-meta text-[var(--cv-t2)]">
              <input
                type="checkbox"
                checked={parameter.required}
                onChange={(event) => update(parameter.id, { required: event.target.checked })}
                disabled={disabled}
              />
              {t('vault.entries.script.parameterRequired')}
            </label>
          </div>
          <div className="mt-2">
            <FormInput
              id={`script-parameter-values-${parameter.id}`}
              label={t('vault.entries.script.parameterAllowedValues')}
              value={parameter.allowedValues}
              onChange={(event) => update(parameter.id, { allowedValues: event.target.value })}
              placeholder={parameter.type === 'boolean' ? '[true, false]' : t('vault.entries.script.parameterValuesPlaceholder')}
              disabled={disabled}
              autoComplete="off"
              error={error === 'allowedValues'}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...parameters, {
          id: crypto.randomUUID(),
          name: '',
          description: '',
          type: 'string',
          required: false,
          allowedValues: '',
        }])}
        disabled={disabled || parameters.length >= 32}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-ui
          text-[var(--cv-btn-ghost-text)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
          disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="add" size={14} />
        {t('vault.entries.script.addParameter')}
      </button>
      <FeedbackSlot visible={Boolean(error)} color="red">
        {error ? t(`vault.entries.script.parameterError.${error}`) : ''}
      </FeedbackSlot>
    </div>
  )
}
