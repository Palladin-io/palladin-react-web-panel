import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { hasApiErrorKey } from '../../../shared/api/error-response'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { useOrg } from '../../settings/use-org'
import { useInvitationRoles } from '../use-invitation-roles'
import { useInviteMembers } from '../use-invite-members'
import { parseEmailRecipients, type EmailRecipientValue } from '../email-recipients'
import { EmailRecipientInput } from './email-recipient-input'

const INVITATION_ERRORS = [
  'organization-member-exists',
  'organization-invitation-pending',
  'organization-seat-limit-reached',
  'organization-role-assignment-forbidden',
  'organization-role-grant-manage-cutover-unavailable',
] as const

const MAX_INVITATIONS = 25
const EMAIL_INPUT_ID = 'invite-member-emails'
const EMAIL_ERROR_ID = 'invite-member-emails-error'
const EMAIL_HINT_ID = 'invite-member-emails-hint'

export function InviteMemberDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null
  return <InviteMemberDialogBody onClose={onClose} />
}

function InviteMemberDialogBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const roles = useInvitationRoles()
  const invite = useInviteMembers()
  const organization = useOrg()
  const [emailValue, setEmailValue] = useState<EmailRecipientValue>({ recipients: [], draft: '' })
  const [emailError, setEmailError] = useState<EmailInputError>(null)
  const [roleId, setRoleId] = useState('')
  const availableRoles = roles.data ?? []
  const selectedRoleId = roleId || availableRoles[0]?.id || ''
  const parsedDraft = parseEmailRecipients(emailValue.draft)
  const parsedEmails = {
    valid: [...new Set([...emailValue.recipients, ...parsedDraft.valid])],
    invalid: parsedDraft.invalid,
  }
  const currentEmailError = getEmailInputError(parsedEmails)
  const canSubmit = currentEmailError === null
    && parsedEmails.valid.length > 0
    && selectedRoleId.length > 0
    && !invite.isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    if (currentEmailError !== null) {
      setEmailError(currentEmailError)
      return
    }

    invite.mutate(
      { emails: parsedEmails.valid, roleId: selectedRoleId },
      {
        onSuccess: async ({ succeeded, failed }) => {
          if (failed.length === 0) {
            toast.success(t('team.invite.success', { count: succeeded.length }))
            onClose()
            return
          }

          setEmailValue({ recipients: failed.map(({ email }) => email), draft: '' })
          if (succeeded.length > 0) {
            toast.error(t('team.invite.partial', {
              sent: succeeded.length,
              failed: failed.length,
            }))
            return
          }

          for (const key of INVITATION_ERRORS) {
            if (await hasApiErrorKey(failed[0].error, key)) {
              toast.error(t(`team.invite.errors.${key}`))
              return
            }
          }
          toast.error(t('team.invite.error'))
        },
        onError: () => toast.error(t('team.invite.error')),
      },
    )
  }

  return (
    <ModalShell
      onClose={invite.isPending ? undefined : onClose}
      ariaLabel={t('team.invite.title')}
      title={t('team.invite.title')}
      width={560}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={onClose} disabled={invite.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="accent" size="sm" className="flex-[2]" type="submit" form="invite-member-form" disabled={!canSubmit}>
            {invite.isPending ? t('team.invite.sending') : t('team.invite.send')}
          </Button>
        </DialogFooter>
      }
    >
      <form id="invite-member-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t3)]">{t('team.invite.description')}</p>
        <InviteSeatUsage
          isPending={organization.isPending}
          isError={organization.isError}
          seatUsage={organization.data?.seatUsage}
          seatLimit={organization.data?.seatLimit}
          onManageSeats={() => {
            onClose()
            // TODO(CVT-509): replace this route hand-off with the paid seat-quantity flow once Billing lands.
            void navigate({ to: '/settings/billing' })
          }}
        />
        <div>
          <EmailRecipientInput
            id={EMAIL_INPUT_ID}
            label={t('team.invite.emailLabel')}
            value={emailValue}
            onChange={(nextValue) => {
              setEmailValue(nextValue)
              setEmailError(null)
            }}
            placeholder={t('team.invite.emailPlaceholder')}
            removeLabel={(email) => t('team.invite.removeRecipient', { email })}
            errorId={EMAIL_ERROR_ID}
            hintId={EMAIL_HINT_ID}
            onBlur={() => setEmailError(currentEmailError)}
            disabled={invite.isPending}
            hasError={emailError !== null}
          />
          <div id={EMAIL_ERROR_ID}>
            <FeedbackSlot visible={emailError !== null} color="red">
              {emailError ? t(`team.invite.validation.${emailError}`, { count: MAX_INVITATIONS }) : ''}
            </FeedbackSlot>
          </div>
          <p
            id={EMAIL_HINT_ID}
            aria-live="polite"
            aria-atomic="true"
            className="mt-1 text-micro text-[var(--cv-t3)]"
          >
            {t('team.invite.emailHint', { count: parsedEmails.valid.length })}
          </p>
        </div>
        {roles.isPending ? (
          <p role="status" className="text-meta text-[var(--cv-t3)]">{t('team.invite.loadingRoles')}</p>
        ) : roles.isError ? (
          <p role="alert" className="text-meta text-[var(--cv-primary)]">{t('team.invite.rolesError')}</p>
        ) : availableRoles.length === 0 ? (
          <p className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-bg-subtle)] p-3 text-meta text-[var(--cv-t3)]">
            {t('team.invite.noRoles')}
          </p>
        ) : (
          <FormSelect
            id="invite-member-role"
            label={t('team.invite.roleLabel')}
            value={selectedRoleId}
            onChange={(event) => setRoleId(event.target.value)}
            disabled={invite.isPending}
          >
            {availableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </FormSelect>
        )}
      </form>
    </ModalShell>
  )
}

function InviteSeatUsage({
  isPending,
  isError,
  seatUsage,
  seatLimit,
  onManageSeats,
}: {
  isPending: boolean
  isError: boolean
  seatUsage?: number
  seatLimit?: number
  onManageSeats: () => void
}) {
  const { t } = useTranslation()

  if (isPending) return <SkeletonBlock height="3rem" />
  if (isError || seatUsage === undefined || seatLimit === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-bg-subtle)] px-3 py-2">
        <Icon name="event_seat" size={14} color="var(--cv-t3)" />
        <span className="min-w-0 flex-1 text-meta text-[var(--cv-t3)]">{t('team.seats.error')}</span>
        <Button variant="ghost" size="sm" onClick={onManageSeats}>
          {t('team.seats.manage')}
        </Button>
      </div>
    )
  }

  const available = Math.max(0, seatLimit - seatUsage)
  const percentage = seatLimit > 0 ? Math.min(100, (seatUsage / seatLimit) * 100) : 0
  const capacityColor = available === 0 ? 'var(--cv-primary)' : 'var(--cv-info)'

  return (
    <section
      aria-label={t('team.seats.label')}
      className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-bg-subtle)] px-3 py-2"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--cv-card-bg)]">
          <Icon name="event_seat" size={14} color="var(--cv-t3)" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-meta font-semibold text-[var(--cv-t2)]">
              {t('team.seats.usage', { used: seatUsage, limit: seatLimit })}
            </span>
            <span className="shrink-0 text-micro font-semibold" style={{ color: capacityColor }}>
              {t('team.seats.available', { available })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t('team.seats.usageAria', { used: seatUsage, limit: seatLimit })}
            aria-valuemin={0}
            aria-valuemax={seatLimit}
            aria-valuenow={seatUsage}
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--cv-card-bg)]"
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${percentage}%`, backgroundColor: capacityColor }}
            />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onManageSeats}>
          {t('team.seats.manage')}
        </Button>
      </div>
    </section>
  )
}

type EmailInputError = 'required' | 'invalid' | 'tooMany' | null

interface ParsedEmails {
  valid: string[]
  invalid: string[]
}

function getEmailInputError({ valid, invalid }: ParsedEmails): EmailInputError {
  if (valid.length === 0 && invalid.length === 0) return 'required'
  if (invalid.length > 0) return 'invalid'
  if (valid.length > MAX_INVITATIONS) return 'tooMany'
  return null
}
