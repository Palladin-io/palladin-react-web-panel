import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import { CreateEntryShareDialog } from './create-entry-share-dialog'
import type { ShareSourceScope } from './use-share-creation'

interface EntryShareActionProps {
  scope: ShareSourceScope
  iconOnly?: boolean
}

export function EntryShareAction(props: EntryShareActionProps) {
  const userId = useAuthStore((state) => state.userId)
  const generation = useAuthStore((state) => state.cryptoSessionGeneration)
  const locked = useAuthStore((state) => state.isVaultLocked)
  const permissions = useAuthStore((state) => state.permissions)
  const organizationId = useAuthStore((state) => organizationIdFromAccessToken(state.accessToken))
  if (locked || !userId || organizationId !== props.scope.organizationId || !(permissions & PERMISSION_VAULT_MANAGE)) return null
  const { scope } = props
  return <ScopedShareAction key={`${userId}:${organizationId}:${generation}:${scope.vaultId}:${scope.entryId}:${scope.revision}:${scope.keyVersion}`}
    {...props} userId={userId} />
}

function ScopedShareAction({ scope, iconOnly, userId }: EntryShareActionProps & { userId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['entry-sharing', userId, scope.organizationId, scope.vaultId, scope.entryId] }) }
  return <>
    <Button size="sm" variant={iconOnly ? 'ghost' : 'accent'} icon={iconOnly ? undefined : 'add'}
      aria-label={t(iconOnly ? 'sharing.shareEntry' : 'sharing.create')} onClick={() => setOpen(true)}
      className={iconOnly ? 'w-action shrink-0 !px-0' : undefined}>
      {iconOnly ? <Icon name="share" size={16} /> : t('sharing.create')}
    </Button>
    {open ? <CreateEntryShareDialog scope={scope} onCreated={refresh} onClose={() => { setOpen(false); refresh() }} /> : null}
  </>
}
