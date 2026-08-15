import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { CopyButton } from '../../../shared/components/copy-button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { analytics } from '../../../shared/lib/analytics'
import { env } from '../../../shared/lib/env'
import type { GeneratedApiKey } from '../api/api-keys-api'
import { useGenerateApiKey } from '../use-generate-api-key'

// TODO: point at the real URLs once palladin.io is live.
const DOCS_URL = 'https://palladin.io/docs'
const SKILL_DOCS_URL = 'https://palladin.io/docs/skill'
const MARKET_URL = 'https://palladin.io/market'

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

    generate.mutate(trimmedName, {
      onSuccess: (key) => {
        analytics.capture('apiKeys', 'api-key-generated')
        setGenerated(key)
      },
      onError: () => {
        toast.error(t('apiKeys.errorGenerate'))
      },
    })
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('apiKeys.generateTitle')}
      title={generated ? t('apiKeys.generatedTitle') : t('apiKeys.generateTitle')}
      width={440}
      footer={
        generated ? (
          <DialogFooter>
            <Button variant="accent" size="sm" onClick={onClose} className="w-full">
              {t('apiKeys.done')}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button variant="subtle" size="sm" onClick={onClose} disabled={isPending} className="flex-1">
              {t('apiKeys.cancel')}
            </Button>
            <Button variant="accent" size="sm" type="submit" form="api-key-form" disabled={!canSubmit} className="flex-[2]">
              {isPending ? t('apiKeys.generating') : t('apiKeys.generate')}
            </Button>
          </DialogFooter>
        )
      }
    >
      {generated ? (
        <GeneratedSecretView generated={generated} keyName={trimmedName} />
      ) : (
        <form id="api-key-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormInput
            id="api-key-name"
            label={t('apiKeys.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('apiKeys.namePlaceholder')}
            autoFocus
            disabled={isPending}
            maxLength={64}
          />
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
  keyName,
}: {
  generated: GeneratedApiKey
  keyName: string
}) {
  const { t } = useTranslation()
  const [agentName, setAgentName] = useState(keyName)

  const connectCommand = `palladin connect --host ${shellQuote(env.apiUrl)} --name ${shellQuote(agentName.trim() || keyName)}`
  const installCommand = 'npm i -g @palladin/agent'
  const agentMessage = t('apiKeys.agentMessageBody', {
    name: agentName.trim() || keyName,
    docs: SKILL_DOCS_URL,
    market: MARKET_URL,
  })

  return (
    <div className="step-enter flex flex-col gap-4">
      <FormInput
        id="generated-api-key"
        label={t('apiKeys.secretLabel')}
        value={generated.plaintext}
        readOnly
        monospace
        copyable
        copyLabel={t('apiKeys.copy')}
        onFocus={(e) => e.currentTarget.select()}
      />

      <div
        className="flex items-start gap-2 rounded-lg border border-[rgb(var(--cv-primary-rgb)/0.25)]
          bg-[rgb(var(--cv-primary-rgb)/0.06)] p-3"
      >
        <span className="mt-0.5 shrink-0 text-[var(--cv-primary)]">
          <Icon name="warning" size={16} />
        </span>
        <p className="text-ui text-[var(--cv-t2)]">
          {t('apiKeys.oneTimeWarning')}
        </p>
      </div>

      <CollapsibleSection title={t('apiKeys.connectTitle')} defaultOpen>
        <FormInput
          id="connect-agent-name"
          label={t('apiKeys.agentNameLabel')}
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder={t('apiKeys.namePlaceholder')}
          maxLength={64}
        />
        <FormInput
          id="connect-command"
          label={t('apiKeys.commandLabel')}
          value={connectCommand}
          readOnly
          monospace
          copyable
          copyLabel={t('apiKeys.copy')}
          onFocus={(e) => e.currentTarget.select()}
        />
        <FormInput
          id="connect-install-command"
          label={t('apiKeys.connectInstall')}
          value={installCommand}
          readOnly
          monospace
          copyable
          copyLabel={t('apiKeys.copy')}
          onFocus={(e) => e.currentTarget.select()}
        />

        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-meta font-medium text-[var(--cv-primary)] hover:underline"
        >
          {t('apiKeys.connectDocs')}
        </a>
      </CollapsibleSection>

      <CollapsibleSection title={t('apiKeys.agentMessageTitle')}>
        <div className="relative">
          <pre
            className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border
              border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 py-2 pr-10 text-ui
              leading-relaxed text-[var(--cv-input-text)]"
          >
            {agentMessage}
          </pre>
          <div className="absolute right-1.5 top-1.5">
            <CopyButton value={agentMessage} label={t('apiKeys.copy')} />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

/** Bordered header + chevron that toggles its content open/closed. */
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--cv-border)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left
          transition-colors hover:bg-[var(--cv-card-hover)]"
      >
        <span className="text-ui font-semibold text-[var(--cv-t1)]">{title}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-[var(--cv-border)] p-3">
          {children}
        </div>
      )}
    </div>
  )
}
