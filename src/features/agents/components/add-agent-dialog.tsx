import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { ModalShell } from '../../../shared/components/modal-shell'
import { copyToClipboard } from '../../../shared/lib/clipboard'
import { analytics } from '../../../shared/lib/analytics'
import { env } from '../../../shared/lib/env'
import {
  createAgentSetupDescriptor,
  createFriendlyAgentName,
  agentProfileId,
  normalizeAgentMetadata,
} from '../pairing-metadata'

interface AddAgentDialogProps {
  open: boolean
  onClose: () => void
  canCreateApiKey: boolean
}

export function AddAgentDialog({ open, onClose, canCreateApiKey }: AddAgentDialogProps) {
  if (!open) return null
  return <AddAgentDialogBody onClose={onClose} canCreateApiKey={canCreateApiKey} />
}

function AddAgentDialogBody({
  onClose,
  canCreateApiKey,
}: {
  onClose: () => void
  canCreateApiKey: boolean
}) {
  const { t, i18n } = useTranslation()
  const [suggestedName] = useState(() => createFriendlyAgentName(i18n.resolvedLanguage ?? i18n.language))
  const [displayName, setDisplayName] = useState(suggestedName)
  const [nameTouched, setNameTouched] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'success' | 'error'>()
  const normalized = normalizeAgentMetadata(displayName.trim() ? displayName : suggestedName, 64)
  const profileId = agentProfileId(normalized ?? '')
  const invalid = normalized === null || profileId === null
  const showNameError = nameTouched && invalid
  const descriptor = createAgentSetupDescriptor(normalized ?? '')
  // All values are space-free, constrained tokens, so leaving them unquoted is
  // portable across POSIX shells, PowerShell and cmd.exe. The raw name is never argv.
  const command = invalid ? '' : `palladin pair-agent --id ${profileId} --host ${pairingApiHost(env.apiUrl)} --setup-descriptor ${descriptor}`
  const message = t('agents.add.message', {
    command,
    interpolation: { escapeValue: false },
  })

  const copy = async () => {
    if (await copyToClipboard(message)) {
      setCopyStatus('success')
      analytics.capture('agents', 'setup-message-copied')
      toast.success(t('agents.add.copied'))
    } else {
      setCopyStatus('error')
      toast.error(t('agents.add.copyError'))
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={t('agents.add.title')}
      title={t('agents.add.title')}
      width={560}
      trapFocus
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
            {t('agents.cancel')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={copy}
            className="flex-[2]"
            disabled={invalid}
          >
            {t('agents.add.copy')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t2)]">{t('agents.add.description')}</p>
        {!canCreateApiKey ? (
          <p className="rounded-lg border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3 text-meta text-[var(--cv-t2)]">
            {t('agents.add.existingApiKeyRequired')}
          </p>
        ) : null}
        <div>
          <FormInput
            id="add-agent-display-name"
            label={t('agents.add.displayName')}
            labelSuffix={t('agents.add.optional')}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value)
              setNameTouched(false)
              setCopyStatus(undefined)
            }}
            onBlur={() => setNameTouched(true)}
            placeholder={suggestedName}
            error={showNameError}
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? 'add-agent-display-name-error' : undefined}
          />
          <FeedbackSlot visible={showNameError} color="red">
            <span id="add-agent-display-name-error">{t(profileId === null && normalized !== null ? 'agents.add.invalidProfileName' : 'agents.add.invalidName')}</span>
          </FeedbackSlot>
          {profileId && <p className="mt-1 text-meta text-[var(--cv-t3)]">{t('agents.add.profileLabel', { profileId })}</p>}
        </div>
        <p className="text-ui text-[var(--cv-t2)]">{t('agents.add.messageHint')}</p>
        <FormTextarea
          id="add-agent-message"
          label={t('agents.add.messageLabel')}
          value={message}
          readOnly
          rows={10}
        />
        <p className="text-meta text-[var(--cv-t3)]">{t('agents.add.noSecrets')}</p>
        <p role="status" aria-live="polite" className="sr-only">
          {copyStatus === 'success'
            ? t('agents.add.copied')
            : copyStatus === 'error'
              ? t('agents.add.copyError')
              : ''}
        </p>
      </div>
    </ModalShell>
  )
}

function pairingApiHost(apiUrl: string): string {
  const parsed = new URL(apiUrl)
  if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') {
    parsed.hostname = '127.0.0.1'
  }
  return parsed.origin
}
