import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import { firstError, required } from '../../../shared/lib/validation'
import { BUILTIN_AGENT_TYPES, type Agent, type AgentType } from '../api/agents-api'
import { useAgentTypes } from '../use-agent-types'
import { useAgentIconUpload } from '../use-agent-icon-upload'
import { useUpdateAgent } from '../use-update-agent'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'
import { AgentTypeCombobox, typeLabel } from './agent-type-combobox'
import { normalizeAgentMetadata } from '../pairing-metadata'

export interface AgentEditFormProps {
  agent: Agent
  /** When false all fields render as disabled and the Save button is hidden. */
  canEdit: boolean
}

export function AgentEditForm({ agent, canEdit }: AgentEditFormProps) {
  const { t } = useTranslation()
  const update = useUpdateAgent()
  const iconUpload = useAgentIconUpload(agent.agentId)
  const agentTypes = useAgentTypes()
  const typeValues = agentTypes.data ?? BUILTIN_AGENT_TYPES

  const [name, setName] = useState(agent.name ?? '')
  const [typeValue, setTypeValue] = useState(agent.type ?? '')
  const [typeInput, setTypeInput] = useState(
    agent.type ? typeLabel(agent.type, t) : '',
  )
  const [description, setDescription] = useState(agent.description ?? '')
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(
    agent.iconKey ?? undefined,
  )
  const [selectedColor, setSelectedColor] = useState<string>(
    agent.iconColor ?? DEFAULT_AGENT_COLOR,
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [typeTouched, setTypeTouched] = useState(false)

  const resetForm = () => {
    setName(agent.name ?? '')
    setTypeValue(agent.type ?? '')
    setTypeInput(agent.type ? typeLabel(agent.type, t) : '')
    setDescription(agent.description ?? '')
    setSelectedIcon(agent.iconKey ?? undefined)
    setSelectedColor(agent.iconColor ?? DEFAULT_AGENT_COLOR)
    setPendingFile(null)
    setNameTouched(false)
    setTypeTouched(false)
  }

  // Reset when navigating to a different agent
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetForm()
    // The form reset is intentionally keyed only by the selected agent identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.agentId])

  const isPending = update.isPending || iconUpload.isUploading
  const isDisabled = !canEdit || isPending

  const normalizedName = normalizeAgentMetadata(name, 64)
  const normalizedType = normalizeAgentMetadata(typeValue, 100)
  const comparableType = normalizedType ?? (typeValue.trim().length === 0 ? '' : typeValue)
  const trimmedName = normalizedName ?? name.trim()
  const trimmedDescription = description.trim()
  const iconChanged =
    pendingFile !== null ||
    selectedIcon !== (agent.iconKey ?? undefined) ||
    selectedColor !== (agent.iconColor ?? DEFAULT_AGENT_COLOR)
  const isDirty =
    trimmedName !== (agent.name?.trim() ?? '') ||
    comparableType !== (agent.type ?? '') ||
    trimmedDescription !== (agent.description?.trim() ?? '') ||
    iconChanged
  const nameError = firstError(name, [required(t('validation.required'))])
    ?? (normalizedName === null ? t('agents.invalidName') : null)
  const isNameValid = nameError === null
  const isTypeValid = typeValue.trim().length === 0 || normalizedType !== null
  const showNameError = nameTouched && !isNameValid
  const showTypeError = typeTouched && !isTypeValid
  const canSubmit = canEdit && isDirty && isNameValid && isTypeValid && !isPending

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSubmit) return

    // 1) If a custom file is pending, upload it first — the hook persists
    //    `iconKey` on its own, so we skip it from the PATCH payload below.
    if (pendingFile) {
      const uploaded = await iconUpload.upload(pendingFile)
      if (uploaded === null) {
        // Surface the specific reason the hook recorded (invalid type / too
        // large / upload failed) rather than the generic update error.
        toast.error(iconUpload.error ?? t('agents.errorUpdate'))
        return
      }
      setSelectedIcon(uploaded)
      setPendingFile(null)
    }

    const input: {
      name: string
      description: string
      type?: AgentType
      iconKey?: string
      iconColor?: string
    } = {
      name: trimmedName,
      description: trimmedDescription,
    }
    if (comparableType !== (agent.type ?? '')) {
      input.type = (normalizedType as AgentType) ?? ''
    }
    // Only include icon fields when the picker (preset or browser) changed.
    // The upload hook already PATCH'd iconKey when pendingFile was set.
    if (!pendingFile) {
      if (selectedIcon !== (agent.iconKey ?? undefined)) {
        input.iconKey = selectedIcon
      }
      if (selectedColor !== (agent.iconColor ?? DEFAULT_AGENT_COLOR)) {
        input.iconColor = selectedColor
      }
    }

    update.mutate(
      { agentId: agent.agentId, input },
      {
        onSuccess: () => {
          analytics.capture('agents', 'agent-updated')
          toast.success(t('agents.editSaved'))
        },
        onError: () => {
          toast.error(t('agents.errorUpdate'))
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-5 items-start">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div>
            <FormInput
              id="agent-name"
              label={t('agents.editName')}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameTouched(false)
              }}
              onBlur={() => setNameTouched(true)}
              disabled={isDisabled}
              error={showNameError}
              aria-invalid={showNameError || undefined}
              aria-describedby={showNameError ? 'agent-name-feedback' : undefined}
            />
            <FeedbackSlot visible={showNameError} color="red">
              <span id="agent-name-feedback">{nameError}</span>
            </FeedbackSlot>
          </div>

          <div>
            <AgentTypeCombobox
              typeValues={typeValues}
              inputValue={typeInput}
              disabled={isDisabled}
              error={showTypeError}
              describedBy={showTypeError ? 'agent-type-feedback' : undefined}
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
              <span id="agent-type-feedback">{t('agents.invalidType')}</span>
            </FeedbackSlot>
          </div>

          <FormTextarea
            id="agent-description"
            label={t('agents.editDescription')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isDisabled}
            maxLength={280}
            rows={3}
          />
        </div>

        <div className="w-60 shrink-0 flex flex-col gap-4">
          <AgentIconPicker
            value={selectedIcon}
            onChange={setSelectedIcon}
            selectedColor={selectedColor}
            onColorChange={setSelectedColor}
            onFileSelected={(file, previewUrl) => {
              setPendingFile(file)
              setSelectedIcon(previewUrl)
            }}
            disabled={isDisabled}
            rowClassName="grid grid-cols-5 gap-1.5 justify-items-center"
          />
        </div>
      </div>

      {canEdit ? (
        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
          <Button
            variant="subtle"
            size="sm"
            type="button"
            onClick={resetForm}
            disabled={isPending}
          >
            {t('agents.cancel')}
          </Button>
          <Button variant="accent" size="sm" type="submit" disabled={!canSubmit}>
            {isPending ? t('agents.saving') : t('agents.editSave')}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
