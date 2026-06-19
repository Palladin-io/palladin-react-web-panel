import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FormInput } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import { BUILTIN_AGENT_TYPES, type AgentType } from '../api/agents-api'
import { AGENT_ICON_MAX_MB, uploadAgentIcon } from '../upload-agent-icon'
import { useAgentTypes } from '../use-agent-types'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'
import { AgentTypeCombobox } from './agent-type-combobox'

export interface ApproveAgentDialogProps {
  open: boolean
  agentName: string
  agentId: string
  /** Pre-fills the name input — the agent's existing name if set. */
  initialName?: string
  /** Pre-fills the type — the type the agent reported at connect (e.g. "ci"). */
  initialType?: string
  isPending: boolean
  onConfirm: (input: {
    name?: string
    type?: AgentType
    iconKey?: string
    iconColor?: string
  }) => void
  onCancel: () => void
}



export function ApproveAgentDialog({
  open,
  agentName,
  agentId,
  initialName = '',
  initialType = '',
  isPending,
  onConfirm,
  onCancel,
}: ApproveAgentDialogProps) {
  const { t } = useTranslation()
  const agentTypes = useAgentTypes()
  const [name, setName] = useState(initialName)
  const [typeInput, setTypeInput] = useState(initialType)
  const [typeValue, setTypeValue] = useState(initialType)
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(undefined)
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_AGENT_COLOR)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  if (!open) return null

  const typeValues = agentTypes.data ?? BUILTIN_AGENT_TYPES

  const handleConfirm = async () => {
    let iconKey = selectedIcon

    // Custom file: validate + upload to S3 before confirming so the persisted
    // iconKey is the public URL — not the throwaway blob: preview. Validation
    // (type + size) lives in the shared helper, in lockstep with the edit flow.
    if (pendingFile) {
      setIsUploading(true)
      const result = await uploadAgentIcon(agentId, pendingFile)
      setIsUploading(false)
      if (!result.ok) {
        if (result.reason === 'invalid-type') {
          toast.error(t('vault.iconUploadError.invalidType'))
        } else if (result.reason === 'too-large') {
          toast.error(t('vault.iconUploadError.tooLarge', { maxMb: AGENT_ICON_MAX_MB }))
        } else {
          toast.error(t('vault.iconUploadError.failed'))
        }
        return
      }
      iconKey = result.iconUrl
    }

    onConfirm({
      name: name.trim() || undefined,
      type: (typeValue.trim() as AgentType) || undefined,
      iconKey,
      iconColor: iconKey ? selectedColor : undefined,
    })
  }

  return (
    <ModalShell
      onClose={isPending || isUploading ? undefined : onCancel}
      ariaLabel={t('agents.approveSetup')}
      width={420}
    >
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('agents.approveSetup')}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cv-t2)]">
            {t('agents.approveConfirmBody', { name: agentName })}
          </p>
        </div>

        {/* Name */}
        <FormInput
          id="approve-agent-name"
          label={t('agents.agentName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          placeholder={t('agents.agentNamePlaceholder')}
          maxLength={64}
        />

        {/* Type — combobox: suggestions from API + free-form input */}
        <AgentTypeCombobox
          typeValues={typeValues}
          inputValue={typeInput}
          disabled={isPending}
          onInputChange={(text) => { setTypeInput(text); setTypeValue(text) }}
          onSelect={(value, label) => { setTypeValue(value); setTypeInput(label) }}
        />

        <AgentIconPicker
          value={selectedIcon}
          onChange={(next) => {
            // Picking a preset / browser icon clears any pending custom file.
            setPendingFile(null)
            setSelectedIcon(next)
          }}
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
          onFileSelected={(file, previewUrl) => {
            setPendingFile(file)
            setSelectedIcon(previewUrl)
          }}
          disabled={isPending || isUploading}
        />
      </div>

      <DialogFooter>
        <Button
          variant="subtle"
          size="sm"
          onClick={onCancel}
          disabled={isPending || isUploading}
          className="flex-1"
        >
          {t('agents.cancel')}
        </Button>
        <Button
          variant="positive"
          size="sm"
          icon="check_circle"
          onClick={handleConfirm}
          disabled={isPending || isUploading}
          className="flex-[2]"
        >
          {isPending || isUploading ? t('agents.approving') : t('agents.approve')}
        </Button>
      </DialogFooter>
    </ModalShell>
  )
}
