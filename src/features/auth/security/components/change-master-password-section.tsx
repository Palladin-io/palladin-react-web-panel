import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../../shared/components/button'
import { FeedbackSlot, FormInput } from '../../../../shared/components/form-field'
import { PasswordStrengthBar } from '../../../../shared/components/password-strength-bar'
import { WarningZone } from '../../../../shared/components/warning-zone'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
} from '../../../../shared/lib/password-strength'
import {
  IncorrectCurrentPasswordError,
  useChangeMasterPassword,
} from '../../hooks/use-change-master-password'

/**
 * Authenticated master-password change. Verifies the current password
 * client-side, re-derives and re-wraps under a new password, and updates the
 * auth credential. The recovery phrase is unaffected and keeps working.
 */
export function ChangeMasterPasswordSection() {
  const { t } = useTranslation()
  const change = useChangeMasterPassword()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [currentError, setCurrentError] = useState<string | null>(null)

  const { score } = evaluatePasswordStrength(next)
  const passwordsMatch = next.length > 0 && next === confirm
  const differsFromCurrent = next.length > 0 && next !== current
  const canSubmit =
    current.length > 0 &&
    isPasswordAcceptable(score) &&
    passwordsMatch &&
    differsFromCurrent &&
    !change.isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setCurrentError(null)
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success(t('security.password.success'))
          setCurrent('')
          setNext('')
          setConfirm('')
        },
        onError: (err) => {
          if (err instanceof IncorrectCurrentPasswordError) {
            setCurrentError(t('security.password.errorCurrentIncorrect'))
          } else {
            toast.error(t('security.password.errorGeneric'))
          }
        },
      },
    )
  }

  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
      <h2 className="text-heading-sm font-bold text-[var(--cv-t1)]">
        {t('security.password.title')}
      </h2>
      <p className="mt-1 text-ui text-[var(--cv-t3)]">{t('security.password.subtitle')}</p>

      <form className="mt-4 flex max-w-[26rem] flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <FormInput
            id="current-master-password"
            label={t('security.password.currentLabel')}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value)
              if (currentError) setCurrentError(null)
            }}
            placeholder={t('security.password.currentPlaceholder')}
            disabled={change.isPending}
            error={currentError !== null}
          />
          <FeedbackSlot visible={currentError !== null} color="red">
            {currentError}
          </FeedbackSlot>
        </div>

        <div>
          <FormInput
            id="new-master-password"
            label={t('security.password.newLabel')}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={t('security.password.newPlaceholder')}
            disabled={change.isPending}
          />
          <PasswordStrengthBar score={score} />
          <FeedbackSlot visible={next.length > 0 && !differsFromCurrent} color="red">
            {t('security.password.mustDiffer')}
          </FeedbackSlot>
        </div>

        <div>
          <FormInput
            id="confirm-master-password"
            label={t('security.password.confirmLabel')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('security.password.confirmPlaceholder')}
            disabled={change.isPending}
            error={confirm.length > 0 && !passwordsMatch}
          />
          <FeedbackSlot visible={confirm.length > 0 && !passwordsMatch} color="red">
            {t('security.password.doNotMatch')}
          </FeedbackSlot>
        </div>

        <WarningZone title={t('security.password.warningTitle')}>
          {t('security.password.warningBody')}
        </WarningZone>

        <div>
          <Button variant="accent" size="sm" type="submit" disabled={!canSubmit}>
            {change.isPending ? t('security.password.saving') : t('security.password.save')}
          </Button>
        </div>
      </form>
    </section>
  )
}
