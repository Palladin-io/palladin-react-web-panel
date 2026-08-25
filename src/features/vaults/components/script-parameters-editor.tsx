import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { Icon } from '../../../shared/components/icon'
import type {
  ScriptParameterDraft,
  ScriptParameterType,
  ScriptParameterValidationError,
} from '../script-parameters'
import type { MenuEntry } from './popover-menu'
import { ScriptMappingRow } from './script-mapping-row'

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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const update = (id: string, patch: Partial<ScriptParameterDraft>) => {
    onChange(parameters.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter))
  }

  const detailsExpanded = (id: string) =>
    expanded.has(id) || error === 'description' || error === 'allowedValues'

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addParameter = () => {
    const id = crypto.randomUUID()
    onChange([...parameters, {
      id,
      name: '',
      description: '',
      type: 'string',
      required: false,
      allowedValues: '',
    }])
    setExpanded((current) => new Set(current).add(id))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
        {parameters.map((parameter, index) => (
          <div key={parameter.id} className={index === 0 ? '' : 'border-t border-[var(--cv-divider)]'}>
            <ScriptMappingRow
              first
              icon="data_object"
              name={parameter.name}
              nameLabel={t('vault.entries.script.parameterName')}
              namePlaceholder="limit"
              onNameChange={(name) => update(parameter.id, { name })}
              disabled={disabled}
              right={<button
                type="button"
                aria-expanded={detailsExpanded(parameter.id)}
                aria-controls={`script-parameter-details-${parameter.id}`}
                aria-label={t(detailsExpanded(parameter.id)
                  ? 'vault.entries.script.hideParameterDetails'
                  : 'vault.entries.script.showParameterDetails', { name: parameter.name || index + 1 })}
                onClick={() => toggleExpanded(parameter.id)}
                className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-meta
                  text-[var(--cv-t2)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
                  hover:text-[var(--cv-t1)]"
              >
                <span className="truncate">
                  {t(parameter.required
                    ? 'vault.entries.script.parameterRequired'
                    : 'vault.entries.script.parameterOptional')}
                </span>
                <Icon name={detailsExpanded(parameter.id) ? 'expand_less' : 'expand_more'} size={14} />
              </button>}
              menuItems={[
                {
                  icon: parameter.required ? 'radio_button_unchecked' : 'check_circle',
                  label: t(parameter.required
                    ? 'vault.entries.script.makeParameterOptional'
                    : 'vault.entries.script.makeParameterRequired'),
                  onSelect: () => update(parameter.id, { required: !parameter.required }),
                },
                'separator',
                {
                  icon: 'delete',
                  label: t('common.remove'),
                  danger: true,
                  onSelect: () => onChange(parameters.filter((candidate) => candidate.id !== parameter.id)),
                },
              ] as MenuEntry[]}
              menuLabel={t('common.moreActions')}
            />
            {detailsExpanded(parameter.id) ? <div
              id={`script-parameter-details-${parameter.id}`}
              className="grid grid-cols-[10rem_minmax(0,1fr)] gap-2 border-t
                border-[var(--cv-divider)] px-3 py-2.5"
            >
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
              <div className="col-span-2">
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
            </div> : null}
          </div>
        ))}
        <button
          type="button"
          onClick={addParameter}
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
