import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { analytics } from '../../../shared/lib/analytics'
import type { GeneratedApiKey } from '../api/api-keys-api'
import { useGenerateApiKey } from '../use-generate-api-key'

export interface GenerateApiKeyModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Thin wrapper that mounts/unmounts the modal body. Keying the body on
 * `open` gives every open a fresh component instance with clean state —
 * no reset effect needed.
 */
export function GenerateApiKeyModal({ open, onClose }: GenerateApiKeyModalProps) {
  if (!open) return null
  return <GenerateApiKeyModalBody onClose={onClose} />
}

function GenerateApiKeyModalBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const generate = useGenerateApiKey()

  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Once set, the modal switches to the one-time-secret view. The
  // plaintext lives only in this component state and is discarded when
  // the modal unmounts on close.
  const [generated, setGenerated] = useState<GeneratedApiKey | null>(null)

  const isPending = generate.isPending
  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setErrorMessage(null)

    generate.mutate(trimmedName, {
      onSuccess: (key) => {
        analytics.capture('apiKeys', 'api-key-generated')
        setGenerated(key)
      },
      onError: () => {
        setErrorMessage(t('apiKeys.errorGenerate'))
      },
    })
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('apiKeys.generateTitle')}
      width={440}
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {generated ? t('apiKeys.generatedTitle') : t('apiKeys.generateTitle')}
        </h2>
        <button
          type="button"
          onClick={isPending ? undefined : onClose}
          disabled={isPending}
          aria-label={t('apiKeys.close')}
          className="text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]
            disabled:cursor-not-allowed"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      {generated ? (
        <GeneratedSecretView generated={generated} onDone={onClose} />
      ) : (
        <form className="flex flex-col gap-1" onSubmit={handleSubmit}>
          <FormInput
            id="api-key-name"
            label={t('apiKeys.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('apiKeys.namePlaceholder')}
            autoFocus
            disabled={isPending}
            maxLength={64}
            required
          />

          <FieldFeedback visible={errorMessage !== null} color="red">
            {errorMessage}
          </FieldFeedback>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="subtle"
              size="md"
              onClick={onClose}
              disabled={isPending}
              className="flex-1"
            >
              {t('apiKeys.cancel')}
            </Button>
            <Button
              variant="accent"
              size="md"
              type="submit"
              disabled={!canSubmit}
              className="flex-[2]"
            >
              {isPending ? t('apiKeys.generating') : t('apiKeys.generate')}
            </Button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

/**
 * One-time display of the freshly generated key. The plaintext can never
 * be retrieved again, so we warn the user prominently and offer a
 * copy-to-clipboard affordance before they close the modal.
 */
function GeneratedSecretView({
  generated,
  onDone,
}: {
  generated: GeneratedApiKey
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generated.plaintext)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may be unavailable (insecure context / denied
      // permission). The key stays selectable in the field as a fallback.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-start gap-2 rounded-lg border border-[rgba(255,79,79,0.25)]
          bg-[rgba(255,79,79,0.06)] p-3"
      >
        <span className="mt-0.5 text-[#FF4F4F]">
          <Icon name="warning" size={16} />
        </span>
        <p className="text-[12px] text-[var(--cv-t2)]">
          {t('apiKeys.oneTimeWarning')}
        </p>
      </div>

      <div>
        <label
          htmlFor="generated-api-key"
          className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
        >
          {t('apiKeys.secretLabel')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="generated-api-key"
            type="text"
            readOnly
            value={generated.plaintext}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-[var(--cv-input-border)]
              bg-[var(--cv-input-bg)] px-3 py-2 font-mono text-[12px]
              text-[var(--cv-input-text)] focus:border-[var(--cv-t1)] focus:outline-none"
          />
          <Button
            variant="subtle"
            size="md"
            icon={copied ? 'check' : 'content_copy'}
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
          </Button>
        </div>
      </div>

      <div className="mt-1 flex justify-end">
        <Button variant="accent" size="md" onClick={onDone}>
          {t('apiKeys.done')}
        </Button>
      </div>
    </div>
  )
}
