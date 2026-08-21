import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { EmptyState } from '../../shared/components/empty-state'
import { ErrorState } from '../../shared/components/error-state'
import { ScrollArea } from '../../shared/components/scroll-area'
import { SearchBar } from '../../shared/components/search-bar'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { ResponsiveMasterDetail } from '../../shared/components/responsive-master-detail'
import { TypeFilterDropdown } from '../../shared/components/type-filter-dropdown'
import { useAuthStore } from '../auth'
import {
  PERMISSION_ADD_USER,
  PERMISSION_ORGANIZATION_MANAGEMENT,
} from '../../shared/lib/permissions'
import { HOVERABLE_CARD_CLASSES, SETTINGS_MASTER_HEADER_CLASSES } from '../../shared/lib/styles'
import type { OrganizationInvitation } from './api/organization-invitations-api'
import type { OrganizationMember } from './api/team-members-api'
import { CancelInvitationDialog } from './components/cancel-invitation-dialog'
import { OrganizationInvitationCard } from './components/organization-invitation-card'
import { OrganizationInvitationDetail } from './components/organization-invitation-detail'
import { TeamMemberCard } from './components/team-member-card'
import { TeamMemberDetail } from './components/team-member-detail'
import { InviteMemberDialog } from './components/invite-member-dialog'
import {
  useCancelOrganizationInvitation,
  useOrganizationInvitations,
} from './use-organization-invitations'
import { useTeamMembers } from './use-team-members'
import { useTeamRoles } from './use-team-roles'

export interface TeamMembersPageProps {
  memberId?: string
  invitationId?: string
  renderLogs?: (memberId: string) => ReactNode
}

export function TeamMembersPage({ memberId, invitationId, renderLogs }: TeamMembersPageProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitationToCancel, setInvitationToCancel] = useState<OrganizationInvitation | null>(null)
  const [search, setSearch] = useState('')
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set())
  const members = useTeamMembers()
  const permissions = useAuthStore((state) => state.permissions)
  const canManage = (permissions & PERMISSION_ORGANIZATION_MANAGEMENT) !== 0
  const canInvite = (permissions & PERMISSION_ADD_USER) !== 0
  const activeInvitationId = canInvite ? invitationId : undefined
  const invitations = useOrganizationInvitations(canInvite)
  const cancelInvitation = useCancelOrganizationInvitation()
  const roles = useTeamRoles(canManage)
  const list = useMemo(() => members.data ?? [], [members.data])
  const invitationList = useMemo(
    () => canInvite ? invitations.data ?? [] : [],
    [canInvite, invitations.data],
  )
  const selectedMember = memberId ? list.find((member) => member.userId === memberId) : undefined
  const selectedInvitation = activeInvitationId
    ? invitationList.find((invitation) => invitation.id === activeInvitationId)
    : undefined
  const allEntries = useMemo<TeamListEntry[]>(() => [
    ...list.map((member): TeamListEntry => ({
      kind: 'member',
      id: member.userId,
      label: member.displayName.trim() || member.email,
      searchText: [
        member.displayName,
        member.email,
        ...member.roles.map((role) => role.name),
      ].join(' ').toLocaleLowerCase(),
      member,
    })),
    ...invitationList.map((invitation): TeamListEntry => ({
      kind: 'pending',
      id: invitation.id,
      label: invitation.email,
      searchText: `${invitation.email} ${invitation.roleName}`.toLocaleLowerCase(),
      invitation,
    })),
  ].sort((left, right) => left.label.localeCompare(right.label, i18n.resolvedLanguage)), [
    i18n.resolvedLanguage,
    invitationList,
    list,
  ])
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleSelectedKinds = canInvite
    ? selectedKinds
    : new Set([...selectedKinds].filter((kind) => kind !== 'pending'))
  const filteredEntries = allEntries.filter((entry) => (
    (visibleSelectedKinds.size === 0 || visibleSelectedKinds.has(entry.kind))
    && (normalizedSearch.length === 0 || entry.searchText.includes(normalizedSearch))
  ))
  const listPending = members.isPending || (canInvite && invitations.isPending)
  const listError = members.isError || (canInvite && invitations.isError)
  const statusOptions = [
    { value: 'member', label: t('team.filters.members') },
    ...(canInvite ? [{ value: 'pending', label: t('team.filters.pending') }] : []),
  ]

  useEffect(() => {
    if (invitationId && !canInvite) {
      void navigate({ to: '/settings/team', replace: true })
    }
  }, [canInvite, invitationId, navigate])

  const handleCancelInvitation = () => {
    if (!canInvite || !invitationToCancel) return
    cancelInvitation.mutate(invitationToCancel.id, {
      onSuccess: () => {
        toast.success(t('team.invitations.cancelSuccess'))
        if (invitationToCancel.id === activeInvitationId) {
          void navigate({ to: '/settings/team' })
        }
        setInvitationToCancel(null)
      },
      onError: () => toast.error(t('team.invitations.cancelError')),
    })
  }

  return (
    <>
      <ResponsiveMasterDetail
        hasSelection={Boolean(memberId || activeInvitationId)}
        masterLabel={t('team.listLabel')}
        detailLabel={t(activeInvitationId ? 'team.invitations.detailLabel' : 'team.memberDetailLabel')}
        master={
          <div className="flex h-full min-h-0 flex-col px-4 py-4 text-[var(--cv-t1)]">
            <header className={SETTINGS_MASTER_HEADER_CLASSES}>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-heading font-bold text-[var(--cv-t1)]">{t('team.title')}</h1>
                <p className="truncate text-meta text-[var(--cv-t3)]">
                  {members.isPending ? t('team.subtitle') : t('team.memberCount', { count: list.length })}
                </p>
              </div>
              {canInvite ? (
                <Button variant="accent" size="sm" icon="person_add" onClick={() => setInviteOpen(true)}>
                  {t('team.invite.action')}
                </Button>
              ) : null}
            </header>
            <div className="mb-3 flex shrink-0 items-stretch gap-2">
              <SearchBar
                name="team-search"
                value={search}
                onChange={setSearch}
                placeholder={t('team.searchPlaceholder')}
                className="min-w-0 flex-1"
              />
              <TypeFilterDropdown
                options={statusOptions}
                selected={visibleSelectedKinds}
                onChange={setSelectedKinds}
                placeholder={t('team.filterStatus')}
                ariaLabel={t('team.filterStatus')}
                triggerClassName="h-control"
                optionPrefix={(value) => (
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${
                      value === 'pending'
                        ? 'bg-[var(--cv-info)]'
                        : 'bg-[var(--cv-success)]'
                    }`}
                  />
                )}
              />
            </div>
            <ScrollArea>
              {listPending ? <TeamListSkeleton /> : listError ? (
                <ErrorState
                  message={t('team.errorLoadAll')}
                  onRetry={() => {
                    void members.refetch()
                    if (canInvite) void invitations.refetch()
                  }}
                />
              ) : allEntries.length === 0 ? (
                <EmptyState
                  icon="group"
                  title={t('team.empty')}
                  description={t('team.emptyHint')}
                  className="p-5"
                />
              ) : filteredEntries.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title={t('team.noMatches')}
                  description={t('team.noMatchesHint')}
                  className="p-5"
                />
              ) : (
                <ul className="flex flex-col gap-[0.625rem]" aria-label={t('team.listLabel')}>
                  {filteredEntries.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`}>
                      {entry.kind === 'member' ? (
                        <Link
                          to="/settings/team/$memberId"
                          params={{ memberId: entry.member.userId }}
                          className={`block overflow-hidden ${HOVERABLE_CARD_CLASSES}${
                            entry.member.userId === memberId
                              ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]'
                              : ''
                          }`}
                        >
                          <TeamMemberCard member={entry.member} />
                        </Link>
                      ) : (
                        <OrganizationInvitationCard
                          invitation={entry.invitation}
                          isSelected={entry.invitation.id === activeInvitationId}
                          onCancel={setInvitationToCancel}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        }
        detail={activeInvitationId ? (
          <OrganizationInvitationDetail
            invitation={selectedInvitation}
            hasSelection
            isLoading={invitations.isPending}
            isError={invitations.isError}
            isCancelling={cancelInvitation.isPending}
            onCancel={setInvitationToCancel}
            onRetry={() => void invitations.refetch()}
          />
        ) : (
          <TeamMemberDetail
            member={selectedMember}
            hasSelection={Boolean(memberId)}
            roles={canManage ? roles.data?.items : selectedMember?.roles}
            isLoading={members.isPending || (canManage && roles.isPending)}
            isError={members.isError || (canManage && roles.isError)}
            canManage={canManage}
            callerPermissions={permissions}
            renderLogs={renderLogs}
            onRetry={() => {
              void members.refetch()
              if (canManage) void roles.refetch()
            }}
          />
        )}
      />
      <InviteMemberDialog open={canInvite && inviteOpen} onClose={() => setInviteOpen(false)} />
      <CancelInvitationDialog
        email={canInvite ? invitationToCancel?.email ?? null : null}
        isPending={cancelInvitation.isPending}
        onConfirm={handleCancelInvitation}
        onClose={() => setInvitationToCancel(null)}
      />
    </>
  )
}

type TeamListEntry =
  | {
      kind: 'member'
      id: string
      label: string
      searchText: string
      member: OrganizationMember
    }
  | {
      kind: 'pending'
      id: string
      label: string
      searchText: string
      invitation: OrganizationInvitation
    }

function TeamListSkeleton() {
  const { t } = useTranslation()

  return (
    <div role="status" aria-label={t('team.loading')} className="flex flex-col gap-[0.625rem]">
      {[0, 1, 2, 3].map((item) => (
        <SkeletonBlock key={item} height="5.875rem" />
      ))}
    </div>
  )
}
