import { useTranslation } from 'react-i18next'

import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
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
      <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
        {parameters.map((parameter, index) => (
          <div key={parameter.id} className={index === 0 ? '' : 'border-t border-[var(--cv-divider)]'}>
            <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
              <span className="flex text-[var(--cv-info)]" aria-hidden="true">
                <Icon name="data_object" size={14} />
              </span>
              <input
                id={`script-parameter-name-${parameter.id}`}
                aria-label={t('vault.entries.script.parameterName')}
                value={parameter.name}
                onChange={(event) => update(parameter.id, { name: event.target.value })}
                placeholder="limit"
                disabled={disabled}
                maxLength={64}
                autoComplete="off"
                className="w-36 shrink-0 border-0 bg-transparent p-0 font-mono text-meta
                  text-[var(--cv-info)] outline-none placeholder:text-[var(--cv-input-placeholder)]
                  disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="flex flex-1 justify-center text-[var(--cv-t3)]" aria-hidden="true">
                <Icon name="arrow_back" size={14} />
              </span>
              <span className="shrink-0 text-ui text-[var(--cv-t1)]">
                {t('vault.entries.script.parameterSource')}
              </span>
              <span className="text-[var(--cv-t3)]">·</span>
              <div className="relative shrink-0">
                <select
                  id={`script-parameter-type-${parameter.id}`}
                  aria-label={t('vault.entries.script.parameterType')}
                  value={parameter.type}
                  onChange={(event) => update(parameter.id, {
                    type: event.target.value as ScriptParameterType,
                    allowedValues: '',
                  })}
                  disabled={disabled}
                  className="max-w-[8.5rem] cursor-pointer appearance-none border-0 bg-transparent py-0 pl-0 pr-5
                    text-ui text-[var(--cv-t1)] outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <option value="string">{t('vault.entries.script.parameterTypeString')}</option>
                  <option value="integer">{t('vault.entries.script.parameterTypeInteger')}</option>
                  <option value="number">{t('vault.entries.script.parameterTypeNumber')}</option>
                  <option value="boolean">{t('vault.entries.script.parameterTypeBoolean')}</option>
                </select>
                <Icon name="expand_more" size={13}
                  className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[var(--cv-icon-muted)]" />
              </div>
              <span className="mx-1 h-4 w-px bg-[var(--cv-divider)]" aria-hidden="true" />
              <span className="shrink-0 text-meta text-[var(--cv-t2)]">
                {t('vault.entries.script.parameterRequired')}
              </span>
              <ToggleSwitch
                checked={parameter.required}
                label={t('vault.entries.script.parameterRequired')}
                onChange={(required) => update(parameter.id, { required })}
                disabled={disabled}
              />
              <button
                type="button"
                aria-label={t('vault.entries.script.removeParameter', { index: index + 1 })}
                onClick={() => onChange(parameters.filter((candidate) => candidate.id !== parameter.id))}
                disabled={disabled}
                className="flex h-action w-action shrink-0 items-center justify-center rounded-lg
                  text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
                  hover:text-[var(--cv-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="delete" size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--cv-divider)] px-3 py-2.5">
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
          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-ui
            text-[var(--cv-btn-ghost-text)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
            ${parameters.length > 0 ? 'border-t border-[var(--cv-divider)]' : ''}
            disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Icon name="add" size={14} />
          {t('vault.entries.script.addParameter')}
        </button>
      </div>
      <FeedbackSlot visible={Boolean(error)} color="red">
        {error ? t(`vault.entries.script.parameterError.${error}`) : ''}
      </FeedbackSlot>
    </div>
  )
}
