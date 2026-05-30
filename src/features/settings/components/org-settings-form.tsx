import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { analytics } from '../../../shared/lib/analytics'
import { firstError, required } from '../../../shared/lib/validation'
import type { Organization } from '../api/org-api'
import { useUpdateOrg } from '../use-update-org'

export interface OrgSettingsFormProps {
  org: Organization
}

/**
 * Editable organization-name form. Submitting an unchanged name is a
 * no-op — we only fire the PUT when the trimmed name actually differs,
 * keeping the payload and audit trail clean.
 */
export function OrgSettingsForm({ org }: OrgSettingsFormProps) {
  const { t } = useTranslation()
  const update = useUpdateOrg()

  const [name, setName] = useState(org.name)
  const [nameError, setNameError] = useState(false)

  const isPending = update.isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (firstError(name, [required(t('validation.required'))]) !== null) {
      setNameError(true)
      return
    }
    if (trimmedName === org.name) return

    update.mutate(
      { name: trimmedName },
      {
        onSuccess: () => {
          analytics.capture('settings', 'org-renamed')
          toast.success(t('settings.org.saved'))
        },
        onError: () => {
          toast.error(t('settings.org.errorSave'))
        },
      },
    )
  }

  return (
    <section
      className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
        dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
    >
      <h2 className="text-[14px] font-bold text-[var(--cv-t1)]">
        {t('settings.org.sectionTitle')}
      </h2>
      <p className="mt-1 text-[12px] text-[var(--cv-t3)]">
        {t('settings.org.sectionSubtitle')}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-0">
        <div className="-mb-0">
          <FormInput
            id="org-name"
            label={t('settings.org.nameLabel')}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(false) }}
            onBlur={() =>
              setNameError(
                firstError(name, [required(t('validation.required'))]) !== null,
              )
            }
            placeholder={t('settings.org.namePlaceholder')}
            disabled={isPending}
            maxLength={80}
            error={nameError}
          />
          <FieldFeedback visible={nameError} color="red">
            {t('validation.required')}
          </FieldFeedback>
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="accent" size="sm" type="submit" disabled={isPending}>
            {isPending ? t('settings.org.saving') : t('settings.org.save')}
          </Button>
        </div>
      </form>
    </section>
  )
}
