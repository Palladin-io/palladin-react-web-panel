import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../shared/components/empty-state'
import { ErrorState } from '../../shared/components/error-state'
import { ScrollArea } from '../../shared/components/scroll-area'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { TeamMemberCard } from './components/team-member-card'
import { useTeamMembers } from './use-team-members'

export function TeamMembersPage() {
  const { t } = useTranslation()
  const members = useTeamMembers()
  const list = members.data ?? []

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4 text-[var(--cv-t1)]">
      <header className="mb-4 shrink-0">
        <h1 className="text-page-title font-bold">{t('team.title')}</h1>
        <p className="mt-1 text-ui text-[var(--cv-t3)]">
          {members.isPending
            ? t('team.subtitle')
            : t('team.memberCount', { count: list.length })}
        </p>
      </header>

      {members.isPending ? (
        <TeamMembersSkeleton />
      ) : members.isError ? (
        <ErrorState message={t('team.errorLoad')} onRetry={members.refetch} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="group"
          title={t('team.empty')}
          description={t('team.emptyHint')}
        />
      ) : (
        <ScrollArea>
          <ul className="flex flex-col gap-[0.625rem]" aria-label={t('team.listLabel')}>
            {list.map((member) => (
              <li key={member.userId}>
                <TeamMemberCard member={member} />
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

function TeamMembersSkeleton() {
  const { t } = useTranslation()

  return (
    <div role="status" aria-label={t('team.loading')} className="flex flex-col gap-[0.625rem]">
      {[0, 1, 2].map((item) => (
        <SkeletonBlock key={item} height="5.75rem" />
      ))}
    </div>
  )
}
