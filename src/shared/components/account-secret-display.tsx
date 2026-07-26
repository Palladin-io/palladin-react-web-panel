import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { encodeAccountSecret } from '../crypto/identity-kdf'
import { AuthSubmitButton } from './auth-submit-button'

interface AccountSecretDisplayProps {
  accountSecret: Uint8Array
  onContinue: () => void
  isPending?: boolean
  error?: string | null
}

export function AccountSecretDisplay({
  accountSecret,
  onContinue,
  isPending = false,
  error,
}: AccountSecretDisplayProps) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const encoded = encodeAccountSecret(accountSecret)

  const copy = async () => {
    await navigator.clipboard.writeText(encoded)
    setCopied(true)
  }

  const download = () => {
    const blob = new Blob([`${t('accountSecret.fileHeading')}\n${encoded}\n`], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'palladin-account-secret.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[rgba(232,234,237,0.12)] bg-[rgba(232,234,237,0.04)] p-4">
        <code
          data-testid="account-secret"
          className="block break-all text-ui leading-6 text-[#E8EAED]"
        >
          {encoded}
        </code>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-[rgba(232,234,237,0.14)] px-3 py-2.5 text-ui text-[#E8EAED]"
        >
          {copied ? t('accountSecret.copied') : t('accountSecret.copy')}
        </button>
        <button
          type="button"
          onClick={download}
          className="rounded-lg border border-[rgba(232,234,237,0.14)] px-3 py-2.5 text-ui text-[#E8EAED]"
        >
          {t('accountSecret.download')}
        </button>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-ui text-[#AAB2BF]">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-0.5"
        />
        <span>{t('accountSecret.savedConfirmation')}</span>
      </label>

      {error && <p role="alert" className="text-ui text-[var(--cv-primary)]">{error}</p>}
      <AuthSubmitButton
        type="button"
        disabled={!saved || isPending}
        onClick={onContinue}
      >
        {isPending ? t('accountSecret.upgrading') : t('common.continue')}
      </AuthSubmitButton>
    </div>
  )
}
