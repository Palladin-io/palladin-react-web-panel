import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { EmptyState } from '../../shared/components/empty-state'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { ResponsiveMasterDetail } from '../../shared/components/responsive-master-detail'
import { ScrollArea } from '../../shared/components/scroll-area'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { DETAIL_SURFACE_CLASSES } from '../../shared/lib/styles'
import { formatRelativeTime } from '../grants'
import type { ApproveSubmissionResponse, SubmissionListItem, SubmissionListState } from './api/submissions-api'
import { SubmissionDecisionPanel } from './components/submission-decision-panel'
import { SubmissionListPanel } from './components/submission-list-panel'
import { submissionSummaryKeys } from './submission-presentation'
import { useRestoreSubmission, useSubmissions } from './use-submissions'

export interface SubmissionsPageProps {
  view: SubmissionListState
  submissionId?: string
}

export function SubmissionsPage({ view, submissionId }: SubmissionsPageProps) {
  const { t } = useTranslation()
  const isWide = useWideScreen()
  const submissions = useSubmissions(view)
  const [approved, setApproved] = useState<ApproveSubmissionResponse | null>(null)
  const item = submissionId ? submissions.data?.find((candidate) => candidate.submissionId === submissionId) : undefined

  function renderDetail() {
    if (!submissionId) return <EmptyState icon="inbox" title={t('submissions.selectPrompt')} />
    if (approved?.submissionId === submissionId) return <ApprovedResult result={approved} />
    if (submissions.isPending) return <SkeletonBlock height="16rem" />
    if (submissions.isError) return <ErrorState message={t('submissions.errorLoad')} onRetry={submissions.refetch} />
    if (!item) return <EmptyState icon="check_circle" title={t('submissions.notFound')} />
    if (view === 'trashed') return <TrashedSubmissionDetail item={item} />
    return <SubmissionDecisionPanel item={item} onApproved={setApproved} />
  }

  return (
    <ResponsiveMasterDetail
      hasSelection={Boolean(submissionId)}
      masterLabel={t('submissions.title')}
      detailLabel={t('submissions.detailLabel')}
      master={(
        <div className="h-full px-4 pt-4 text-[var(--cv-t1)]">
          <SubmissionListPanel view={view} selectedSubmissionId={submissionId} />
        </div>
      )}
      detail={(
        <div className="flex h-full min-h-0 flex-col px-4 py-4 text-[var(--cv-t1)]">
          {!isWide && (
            <div className="mb-3 shrink-0">
              <Link
                to="/submissions"
                search={view === 'trashed' ? { view: 'trashed' } : {}}
                className="flex h-action w-action items-center justify-center rounded-lg text-[var(--cv-t3)] hover:bg-[var(--cv-list-item-hover)]"
                aria-label={t('common.back')}
              >
                <Icon name="arrow_back" size={18} />
              </Link>
            </div>
          )}
          <ScrollArea>{renderDetail()}</ScrollArea>
        </div>
      )}
    />
  )
}

function ApprovedResult({ result }: { result: ApproveSubmissionResponse }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <EmptyState
      icon="check_circle"
      title={t('submissions.decision.approved')}
      action={(
        <Button
          variant="accent"
          size="sm"
          icon="arrow_forward"
          onClick={() => navigate({
            to: '/vaults/$vaultId/entries/$entryId',
            params: { vaultId: result.vaultId, entryId: result.entryId },
          })}
        >
          {t('submissions.decision.openEntry')}
        </Button>
      )}
    />
  )
}

function TrashedSubmissionDetail({ item }: { item: SubmissionListItem }) {
  const { t } = useTranslation()
  const restore = useRestoreSubmission()
  const summary = submissionSummaryKeys(item)
  return (
    <section className={`${DETAIL_SURFACE_CLASSES} p-4`}>
      <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">{item.agentName}</h2>
      <p className="text-meta text-[var(--cv-t3)]">
        {t(summary.kindKey)} · {t(summary.typeKey)} · {formatRelativeTime(item.createdAt, t)}
      </p>
      <p className="mt-4 border-t border-[var(--cv-divider)] pt-4 text-ui text-[var(--cv-t2)]">
        {t('submissions.trash.description')}
      </p>
      <div className="mt-4 flex justify-end">
        <Button
          variant="subtle"
          size="sm"
          icon="restore"
          disabled={restore.isPending}
          onClick={() => restore.mutate(item.submissionId, {
            onSuccess: () => toast.success(t('submissions.trash.restored')),
            onError: () => toast.error(t('submissions.trash.restoreFailed')),
          })}
        >
          {t('submissions.trash.restore')}
        </Button>
      </div>
    </section>
  )
}
