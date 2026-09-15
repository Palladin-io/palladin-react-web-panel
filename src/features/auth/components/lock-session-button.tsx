import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { lockClientSession } from '../session/manual-lock'

export function LockSessionButton() {
  const { t } = useTranslation()
  return <Button variant="ghost" size="sm" icon="lock" className="w-action px-0!" aria-label={t('auth.lockSession')} title={t('auth.lockSession')}
    onClick={() => { void lockClientSession().catch(() => toast.error(t('auth.sharedLockFailed'))) }} />
}
