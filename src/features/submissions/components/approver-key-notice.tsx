import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { EmptyState } from '../../../shared/components/empty-state'
import { WarningZone } from '../../../shared/components/warning-zone'
import { useRebootstrapApproverKeys, type ApproverKeyPresentation } from '../use-approver-keys'

const PRESENTATION_KEY: Record<Exclude<ApproverKeyPresentation, 'ready' | 'unavailable'>, { icon: string; key: string }> = {
  loading: { icon: 'hourglass_empty', key: 'submissions.keys.loading' },
  settingUp: { icon: 'hourglass_empty', key: 'submissions.keys.settingUp' },
  waiting: { icon: 'group', key: 'submissions.keys.waiting' },
  error: { icon: 'error', key: 'submissions.keys.error' },
}

/** Explains why submissions cannot be opened yet; re-bootstrap is always an explicit choice. */
export function ApproverKeyNotice({ presentation }: { presentation: ApproverKeyPresentation }) {
  const { t } = useTranslation()
  if (presentation === 'ready') return null
  if (presentation === 'unavailable') return <RebootstrapPrompt />
  const { icon, key } = PRESENTATION_KEY[presentation]
  return <EmptyState icon={icon} title={t(key)} />
}

export function RebootstrapPrompt() {
  const { t } = useTranslation()
  const rebootstrap = useRebootstrapApproverKeys()
  return (
    <div className="flex flex-col gap-3">
      <WarningZone title={t('submissions.keys.rebootstrapTitle')}>
        {t('submissions.keys.rebootstrapWarning')}
      </WarningZone>
      <div className="flex justify-end">
        <Button
          variant="accent"
          size="sm"
          disabled={rebootstrap.isPending}
          onClick={() => rebootstrap.mutate(undefined, {
            onSuccess: () => toast.success(t('submissions.keys.rebootstrapDone')),
            onError: () => toast.error(t('submissions.keys.rebootstrapFailed')),
          })}
        >
          {rebootstrap.isPending ? t('submissions.keys.rebootstrapping') : t('submissions.keys.rebootstrap')}
        </Button>
      </div>
    </div>
  )
}
