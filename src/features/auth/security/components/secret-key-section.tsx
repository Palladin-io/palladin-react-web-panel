import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Monitor, QrCode as QrCodeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../../shared/api/account-api'
import { Button } from '../../../../shared/components/button'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { MetadataBadge } from '../../../../shared/components/metadata-badge'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { identityProfileVersion } from '../../../../shared/crypto/identity-kdf'
import { DEVICE_SECRET_KEY_QUERY_KEY, useDeviceSecretKeyStatus, useForgetThisBrowser } from '../../hooks/use-secret-key'
import { AddPhoneDialog } from './add-phone-dialog'
import { EmergencyKitDialog } from './emergency-kit-dialog'

/** Secret Key, Emergency Kit re-download and device transfer; shown for Identity v2 accounts only. */
export function SecretKeySection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const account = useQuery({ queryKey: ACCOUNT_QUERY_KEY, queryFn: getAccount, staleTime: 5 * 60 * 1000 })
  const accountId = account.data?.userId
  const stored = useDeviceSecretKeyStatus(accountId)
  const forget = useForgetThisBrowser()
  const [dialog, setDialog] = useState<'kit' | 'phone' | 'forget' | null>(null)

  const kdf = account.data?.kdf
  if (!kdf || !accountId || safeProfileVersion(kdf) !== 2) return null
  const onThisBrowser = stored.data === true

  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-heading-sm font-bold text-[var(--cv-t1)]">{t('secretKey.settings.title')}</h2>
          <p className="mt-1 text-ui text-[var(--cv-t3)]">{t('secretKey.settings.subtitle')}</p>
        </div>
        <MetadataBadge color={onThisBrowser ? 'var(--cv-success)' : undefined}>
          <KeyRound size={14} />
          {onThisBrowser ? t('secretKey.settings.savedHere') : t('secretKey.settings.notSavedHere')}
        </MetadataBadge>
      </div>
      <p className="mt-3 text-meta text-[var(--cv-t3)]">{t('secretKey.settings.neverStored')}</p>

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
        {onThisBrowser && (
          <>
            <Button variant="subtle" size="sm" onClick={() => setDialog('forget')}>
              <Monitor size={14} /> {t('secretKey.settings.forget')}
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setDialog('phone')}>
              <QrCodeIcon size={14} /> {t('secretKey.settings.addPhone')}
            </Button>
            <Button variant="accent" size="sm" onClick={() => setDialog('kit')}>
              {t('secretKey.settings.downloadKit')}
            </Button>
          </>
        )}
      </div>

      {dialog === 'kit' && <EmergencyKitDialog onClose={() => setDialog(null)} />}
      {dialog === 'phone' && <AddPhoneDialog accountId={accountId} onClose={() => setDialog(null)} />}
      {dialog === 'forget' && (
        <ModalShell
          onClose={forget.isPending ? undefined : () => setDialog(null)}
          ariaLabel={t('secretKey.settings.forgetTitle')}
          title={t('secretKey.settings.forgetTitle')}
          width={440}
          footer={
            <DialogFooter>
              <Button variant="subtle" size="sm" className="flex-1" disabled={forget.isPending}
                onClick={() => setDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" size="sm" className="flex-[2]" disabled={forget.isPending}
                onClick={() => forget.mutate(accountId, {
                  onSuccess: () => {
                    void queryClient.invalidateQueries({ queryKey: DEVICE_SECRET_KEY_QUERY_KEY })
                    toast.success(t('secretKey.settings.forgotten'))
                    setDialog(null)
                  },
                })}>
                {t('secretKey.settings.forget')}
              </Button>
            </DialogFooter>
          }
        >
          <p className="text-ui text-[var(--cv-t2)]">{t('secretKey.settings.forgetBody')}</p>
        </ModalShell>
      )}
    </section>
  )
}

function safeProfileVersion(kdf: Parameters<typeof identityProfileVersion>[0]): number | null {
  try {
    return identityProfileVersion(kdf)
  } catch {
    return null
  }
}
