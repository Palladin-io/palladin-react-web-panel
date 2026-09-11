import { toast } from 'sonner'
import i18n from '../../../shared/lib/i18n'

/** Called once by the completed receiver, never by state restoration or ACK. */
export function notifySharedUnlockCompleted() {
  toast.success(i18n.t('unlock.sharedUnlockCompleted'), { duration: 4000 })
}
