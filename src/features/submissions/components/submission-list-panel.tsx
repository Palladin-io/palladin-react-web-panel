import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { EmptyState } from '../../../shared/components/empty-state'
import { Icon } from '../../../shared/components/icon'
import { MetadataBadge } from '../../../shared/components/metadata-badge'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import {
  ENTITY_ICON_FRAME_CLASSES,
  NAVIGATION_ROW_CLASSES,
  SELECTED_NAVIGATION_CARD_CLASSES,
  SETTINGS_MASTER_HEADER_CLASSES,
  TAB_BUTTON_CLASSES,
} from '../../../shared/lib/styles'
import { formatRelativeTime } from '../../grants'
import type { SubmissionListItem, SubmissionListState } from '../api/submissions-api'
import { submissionSummaryKeys } from '../submission-presentation'
import { useSubmissions } from '../use-submissions'

export interface SubmissionListPanelProps {
  view: SubmissionListState
  selectedSubmissionId?: string
}

export function SubmissionListPanel({ view, selectedSubmissionId }: SubmissionListPanelProps) {
  const { t } = useTranslation()
  const submissions = useSubmissions(view)
  const pendingCount = useSubmissions('pending').data?.length ?? 0
  const items = submissions.data ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={SETTINGS_MASTER_HEADER_CLASSES}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">{t('submissions.title')}</h2>
          <p className="truncate text-meta text-[var(--cv-t3)]">{t('submissions.subtitle')}</p>
        </div>
      </div>

      <div className="mb-3 flex shrink-0 items-center gap-1" role="tablist" aria-label={t('submissions.viewLabel')}>
        {(['pending', 'trashed'] as const).map((option) => (
          <Link
            key={option}
            to="/submissions"
            search={option === 'trashed' ? { view: 'trashed' } : {}}
            role="tab"
            aria-selected={view === option}
            className={TAB_BUTTON_CLASSES}
          >
            {t(option === 'pending' ? 'submissions.viewPending' : 'submissions.viewTrash')}
            {option === 'pending' && pendingCount > 0 ? <MetadataBadge>{pendingCount}</MetadataBadge> : null}
          </Link>
        ))}
      </div>

      <ScrollArea>
        {submissions.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => <SkeletonBlock key={index} height="3.625rem" />)}
          </div>
        ) : submissions.isError ? (
          <ErrorState message={t('submissions.errorLoad')} onRetry={submissions.refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={view === 'pending' ? 'check_circle' : 'delete'}
            title={t(view === 'pending' ? 'submissions.emptyPending' : 'submissions.emptyTrash')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.submissionId}>
                <SubmissionRow item={item} view={view} isSelected={item.submissionId === selectedSubmissionId} />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

function SubmissionRow({ item, view, isSelected }: { item: SubmissionListItem; view: SubmissionListState; isSelected: boolean }) {
  const { t } = useTranslation()
  const summary = submissionSummaryKeys(item)
  return (
    <Link
      to="/submissions/$submissionId"
      params={{ submissionId: item.submissionId }}
      search={view === 'trashed' ? { view: 'trashed' } : {}}
      aria-current={isSelected ? 'page' : undefined}
      className={`flex items-center gap-3 px-3 py-3 ${NAVIGATION_ROW_CLASSES}${isSelected ? ` ${SELECTED_NAVIGATION_CARD_CLASSES}` : ''}`}
    >
      <span className={`${ENTITY_ICON_FRAME_CLASSES} size-8 text-[var(--cv-t3)]`} aria-hidden="true">
        <Icon name={summary.icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-ui font-medium text-[var(--cv-t1)]">{item.agentName}</span>
          <span className="shrink-0 text-micro text-[var(--cv-t3)]">{formatRelativeTime(item.createdAt, t)}</span>
        </div>
        <span className="block truncate text-meta text-[var(--cv-t3)]">
          {t(summary.kindKey)} · {t(summary.typeKey)}
        </span>
      </div>
    </Link>
  )
}
