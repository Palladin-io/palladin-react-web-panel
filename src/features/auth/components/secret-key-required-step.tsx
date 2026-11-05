import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Smartphone, Timer } from 'lucide-react'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FeedbackSlot } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { QrCode } from '../../../shared/components/qr-code'
import { useCountdown } from '../../../shared/hooks/use-countdown'
import { parseSecretKeyInput, SecretKeyError, storeDeviceSecretKey } from '../../../shared/crypto/secret-key'
import { wipe } from '../../../shared/crypto/sodium'
import { useReceiveSecretKey } from '../hooks/use-receive-secret-key'

const QR_CARD_CLASSES = `flex flex-col items-center gap-3 rounded-lg border border-[var(--cv-auth-control-border)]
  bg-[var(--cv-auth-control-bg)] p-3`

export interface SecretKeyRequiredStepProps {
  accountId: string
  /** The Secret Key is now in this browser's device wrapper; retry the sign-in. */
  onSecretKeyStored: () => void
  onBack: () => void
}

/**
 * Shown after the password on a browser without the Secret Key: approve from a
 * signed-in phone (QR + code comparison) or type the key from the Emergency Kit.
 */
export function SecretKeyRequiredStep({ accountId, onSecretKeyStored, onBack }: SecretKeyRequiredStepProps) {
  const [mode, setMode] = useState<'phone' | 'kit'>('phone')
  return mode === 'phone'
    ? <ApproveWithPhone accountId={accountId} onReceived={onSecretKeyStored} onUseKit={() => setMode('kit')} onBack={onBack} />
    : <EnterFromKit accountId={accountId} onStored={onSecretKeyStored} onUsePhone={() => setMode('phone')} />
}

function ApproveWithPhone({ accountId, onReceived, onUseKit, onBack }: {
  accountId: string
  onReceived: () => void
  onUseKit: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { state, restart } = useReceiveSecretKey(accountId, onReceived)
  const remaining = useCountdown(state.step === 'waiting' ? state.expiresAt : null)

  return (
    <div className="flex flex-col gap-3 text-left">
      <SecretKeyStepHeader title={t('secretKey.newBrowser.title')} subtitle={t('secretKey.newBrowser.subtitle')} />

      {state.step === 'waiting' && (
        <div className={QR_CARD_CLASSES}>
          <QrCode value={state.qr} size={176} alt={t('secretKey.newBrowser.qrAlt')} />
          <p className="text-meta text-[var(--cv-auth-muted)]">{t('secretKey.newBrowser.sasLabel')}</p>
          <p className="font-mono text-heading font-semibold tracking-wide text-[var(--cv-t1)]" data-testid="pairing-sas">
            {state.sas}
          </p>
          <p className="text-meta text-[var(--cv-auth-secondary)]">{t('secretKey.newBrowser.waiting')}</p>
          {remaining && (
            <p className="flex items-center gap-1 text-meta text-[var(--cv-auth-muted)]">
              <Timer size={12} /> {t('secretKey.expiresIn', { time: remaining })}
            </p>
          )}
        </div>
      )}
      {state.step === 'starting' && (
        <div className={QR_CARD_CLASSES}>
          <div className="h-44 w-44 animate-pulse rounded-lg bg-[var(--cv-bg-subtle)]" role="status"
            aria-label={t('common.loading')} />
        </div>
      )}
      {(state.step === 'expired' || state.step === 'failed') && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-center text-ui text-[var(--cv-auth-secondary)]">
            {t(state.step === 'expired' ? 'secretKey.newBrowser.expired' : 'secretKey.newBrowser.failed')}
          </p>
          <AuthSubmitButton type="button" onClick={() => void restart()}>{t('secretKey.newCode')}</AuthSubmitButton>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 text-ui">
        <button type="button" onClick={onUseKit}
          className="flex items-center gap-2 text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]">
          <FileText size={14} /> {t('secretKey.newBrowser.useKit')}
        </button>
        <button type="button" onClick={onBack}
          className="text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]">
          {t('common.back')}
        </button>
      </div>
    </div>
  )
}

function EnterFromKit({ accountId, onStored, onUsePhone }: {
  accountId: string
  onStored: () => void
  onUsePhone: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    let secretKey: Uint8Array | null = null
    try {
      secretKey = parseSecretKeyInput(accountId, value)
    } catch (parseError) {
      setError(t(parseError instanceof SecretKeyError && parseError.code !== 'secret-key-malformed'
        ? 'secretKey.kit.errorMismatch' : 'secretKey.kit.errorMalformed'))
      return
    }
    setSaving(true)
    try {
      await storeDeviceSecretKey(accountId, secretKey)
      setValue('')
      onStored()
    } catch {
      setError(t('secretKey.kit.errorStorage'))
    } finally {
      wipe(secretKey)
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-3 text-left" onSubmit={submit}>
      <SecretKeyStepHeader title={t('secretKey.kit.title')} subtitle={t('secretKey.kit.subtitle')} />
      <div className="ph-no-capture">
        <FormTextarea
          id="secret-key-input"
          label={t('emergencyKit.secretKeyLabel')}
          monospace
          rows={3}
          autoComplete="off"
          spellCheck={false}
          hasError={error !== null}
          value={value}
          placeholder="PSK2-"
          onChange={(event) => { setValue(event.target.value); if (error) setError(null) }}
        />
        <FeedbackSlot visible={error !== null} color="red">{error}</FeedbackSlot>
        <p className="mt-1 text-meta text-[var(--cv-auth-muted)]">{t('secretKey.kit.hint')}</p>
      </div>
      <p className="flex items-start gap-2 text-meta text-[var(--cv-auth-secondary)]">
        <Smartphone size={14} className="mt-0.5 shrink-0" /> {t('secretKey.kit.remembered')}
      </p>
      <AuthSubmitButton disabled={saving || value.trim().length === 0}>{t('common.continue')}</AuthSubmitButton>
      <div className="flex flex-col items-center gap-2 text-ui">
        <button type="button" onClick={onUsePhone}
          className="text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]">
          {t('secretKey.kit.usePhone')}
        </button>
      </div>
    </form>
  )
}

function SecretKeyStepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2 text-center">
      <h2 className="mb-1 text-auth-title font-bold leading-tight text-[var(--cv-t1)]">{title}</h2>
      <p className="text-heading-sm text-[var(--cv-auth-muted)]">{subtitle}</p>
    </div>
  )
}
