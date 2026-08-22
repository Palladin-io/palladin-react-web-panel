import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { hasApiErrorKey } from '../../shared/api/error-response'
import { AuthStepShell } from '../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../shared/components/auth-submit-button'
import { Icon } from '../../shared/components/icon'
import { clearPushTokenOnLogout } from '../notifications'
import {
  captureAuthenticatedSession,
  terminateAuthenticatedSession,
} from '../auth'
import { useAcceptOrganizationInvitation } from './use-accept-organization-invitation'

type AcceptError =
  | 'invalid'
  | 'emailMismatch'
  | 'seatLimit'
  | 'alreadyMember'
  | 'unavailable'
  | 'generic'

interface AcceptOrganizationInvitationPageProps {
  token?: string
}

const ERROR_KEYS: Record<Exclude<AcceptError, 'generic'>, string[]> = {
  invalid: [
    'organization-invitation-invalid',
    'organization-invitation-expired',
  ],
  emailMismatch: ['organization-invitation-email-mismatch'],
  seatLimit: ['organization-seat-limit-reached'],
  alreadyMember: ['organization-member-exists'],
  unavailable: [
    'organization-invitation-role-unassignable',
    'organization-role-grant-manage-cutover-unavailable',
  ],
}

async function classifyAcceptError(error: unknown): Promise<AcceptError> {
  for (const [kind, keys] of Object.entries(ERROR_KEYS) as Array<
    [Exclude<AcceptError, 'generic'>, string[]]
  >) {
    for (const key of keys) {
      if (
        await hasApiErrorKey(error, key)
        || await hasApiErrorKey(error, `errors.backend.${key}`)
      ) {
        return kind
      }
    }
  }
  return 'generic'
}

export function AcceptOrganizationInvitationPage({
  token,
}: AcceptOrganizationInvitationPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const accept = useAcceptOrganizationInvitation()
  const [error, setError] = useState<AcceptError | null>(null)
  const [accepted, setAccepted] = useState(false)

  const handleAccept = () => {
    if (!token) return
    setError(null)
    accept.mutate(token, {
      onSuccess: () => setAccepted(true),
      onError: async (cause) => setError(await classifyAcceptError(cause)),
    })
  }

  const handleDifferentAccount = async () => {
    const redirect = token
      ? `/invitations/accept?token=${encodeURIComponent(token)}`
      : '/invitations/accept'
    const session = captureAuthenticatedSession()
    void clearPushTokenOnLogout(session)
    if (await terminateAuthenticatedSession(session)) {
      navigate({ to: '/login', search: { redirect } })
    }
  }

  if (accepted || accept.isSuccess) {
    return (
      <AuthStepShell
        showLogo
        align="center"
        logoAlt={t('auth.appName')}
        title={t('team.invitationAccept.successTitle')}
        subtitle={t('team.invitationAccept.successSubtitle')}
      >
        <AuthSubmitButton
          type="button"
          onClick={() => navigate({ to: '/unlock', search: { redirect: '/' } })}
        >
          {t('team.invitationAccept.openOrganization')}
        </AuthSubmitButton>
      </AuthStepShell>
    )
  }

  const invalidLink = !token
  const errorKey = invalidLink ? 'invalid' : error

  return (
    <AuthStepShell
      showLogo
      align="center"
      logoAlt={t('auth.appName')}
      title={t(
        errorKey
          ? 'team.invitationAccept.errorTitle'
          : 'team.invitationAccept.title',
      )}
      subtitle={t(
        errorKey
          ? `team.invitationAccept.errors.${errorKey}`
          : 'team.invitationAccept.subtitle',
      )}
    >
      {!errorKey && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-[rgba(232,234,237,0.08)] bg-[rgba(232,234,237,0.04)] px-3 py-3 text-left">
          <Icon name="group_add" className="mt-0.5 shrink-0 text-[var(--cv-primary)]" />
          <p className="text-meta text-[#B8C5D4]">
            {t('team.invitationAccept.confirmHint')}
          </p>
        </div>
      )}

      {errorKey ? (
        <div className="flex flex-col gap-3">
          {errorKey === 'emailMismatch' && (
            <AuthSubmitButton type="button" onClick={handleDifferentAccount}>
              {t('team.invitationAccept.useDifferentAccount')}
            </AuthSubmitButton>
          )}
          {errorKey === 'generic' && (
            <AuthSubmitButton
              type="button"
              onClick={handleAccept}
              disabled={accept.isPending}
            >
              {t('team.invitationAccept.retry')}
            </AuthSubmitButton>
          )}
        </div>
      ) : (
        <AuthSubmitButton
          type="button"
          onClick={handleAccept}
          disabled={accept.isPending}
        >
          {accept.isPending
            ? t('team.invitationAccept.accepting')
            : t('team.invitationAccept.accept')}
        </AuthSubmitButton>
      )}
    </AuthStepShell>
  )
}
