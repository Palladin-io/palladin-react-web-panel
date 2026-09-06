import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import { BUILTIN_AGENT_TYPES, type AgentType } from '../api/agents-api'
import { AGENT_ICON_MAX_MB, uploadAgentIcon } from '../upload-agent-icon'
import { useAgentTypes } from '../use-agent-types'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'
import { AgentTypeCombobox } from './agent-type-combobox'
import { normalizeAgentMetadata } from '../pairing-metadata'

export interface ApproveAgentDialogProps {
  open: boolean
  agentId: string
  /** Pre-fills the name input — the agent's existing name if set. */
  initialName?: string
  /** Pre-fills the type — the type the agent reported at connect (e.g. "ci"). */
  initialType?: string
  isPending: boolean
  isProvisioning?: boolean
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
  agentId,
  initialName = '',
  initialType = '',
  isPending,
  isProvisioning = false,
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
  const [nameTouched, setNameTouched] = useState(false)
  const [typeTouched, setTypeTouched] = useState(false)

  if (!open) return null

  const typeValues = agentTypes.data ?? BUILTIN_AGENT_TYPES
  const normalizedName = normalizeAgentMetadata(name, 64)
  const normalizedType = normalizeAgentMetadata(typeValue, 100)
  const isNameValid = name.trim().length === 0 || normalizedName !== null
  const isTypeValid = typeValue.trim().length === 0 || normalizedType !== null
  const initialNameInvalid = initialName.trim().length > 0
    && normalizeAgentMetadata(initialName, 64) === null
  const initialTypeInvalid = initialType.trim().length > 0
    && normalizeAgentMetadata(initialType, 100) === null
  const showNameError = !isNameValid
    && (nameTouched || (initialNameInvalid && name === initialName))
  const showTypeError = !isTypeValid
    && (typeTouched || (initialTypeInvalid && typeValue === initialType))

  const handleConfirm = async () => {
    if (!isNameValid || !isTypeValid) return
    let iconKey = selectedIcon

    // Completion stores the stable catalog reference on the Agent aggregate.
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
      iconKey = result.iconReference
    }

    onConfirm({
      name: normalizedName ?? undefined,
      type: (normalizedType as AgentType) ?? undefined,
      iconKey,
      iconColor: iconKey ? selectedColor : undefined,
    })
  }

  return (
    <ModalShell
      onClose={isPending || isUploading ? undefined : onCancel}
      ariaLabel={t('agents.approveSetup')}
      title={t('agents.approveSetup')}
      width={560}
      trapFocus
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending || isUploading} className="flex-1">
            {t('agents.cancel')}
          </Button>
          <Button variant="positive" size="sm" icon="check_circle" onClick={handleConfirm} disabled={isPending || isUploading || !isNameValid || !isTypeValid} className="flex-[2]">
            {isProvisioning
              ? t('agents.provisioningDiscovery')
              : isPending || isUploading ? t('agents.approving') : t('agents.approve')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-ui text-[var(--cv-t2)]">
          {t('agents.approveHint')}
        </p>

        {/* Name */}
        <div>
          <FormInput
            id="approve-agent-name"
            label={t('agents.agentName')}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(false)
            }}
            onBlur={() => setNameTouched(true)}
            disabled={isPending || isUploading}
            placeholder={t('agents.agentNamePlaceholder')}
            error={showNameError}
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? 'approve-agent-name-feedback' : undefined}
          />
          <FeedbackSlot visible={showNameError} color="red">
            <span id="approve-agent-name-feedback">{t('agents.invalidName')}</span>
          </FeedbackSlot>
        </div>

        {/* Type — combobox: suggestions from API + free-form input */}
        <div>
          <AgentTypeCombobox
            typeValues={typeValues}
            inputValue={typeInput}
            disabled={isPending || isUploading}
            error={showTypeError}
            describedBy={showTypeError ? 'approve-agent-type-feedback' : undefined}
            onBlur={() => setTypeTouched(true)}
            onInputChange={(text) => {
              setTypeInput(text)
              setTypeValue(text)
              setTypeTouched(false)
            }}
            onSelect={(value, label) => {
              setTypeValue(value)
              setTypeInput(label)
              setTypeTouched(false)
            }}
          />
          <FeedbackSlot visible={showTypeError} color="red">
            <span id="approve-agent-type-feedback">{t('agents.invalidType')}</span>
          </FeedbackSlot>
        </div>

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
    </ModalShell>
  )
}
