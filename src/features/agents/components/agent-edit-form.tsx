import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'
import { BUILTIN_AGENT_TYPES, type Agent, type AgentType } from '../api/agents-api'
import { useAgentTypes } from '../use-agent-types'
import { useAgentIconUpload } from '../use-agent-icon-upload'
import { useUpdateAgent } from '../use-update-agent'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'
import { agentTypeLabelKey } from './agent-presentation'

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
  const [type, setType] = useState(agent.type ?? '')
  const [description, setDescription] = useState(agent.description ?? '')
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(
    agent.iconKey ?? undefined,
  )
  const [selectedColor, setSelectedColor] = useState<string>(
    agent.iconColor ?? DEFAULT_AGENT_COLOR,
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  // Reset when navigating to a different agent
  useEffect(() => {
    setName(agent.name ?? '')
    setType(agent.type ?? '')
    setDescription(agent.description ?? '')
    setSelectedIcon(agent.iconKey ?? undefined)
    setSelectedColor(agent.iconColor ?? DEFAULT_AGENT_COLOR)
    setPendingFile(null)
  }, [agent.agentId])

  const resetForm = () => {
    setName(agent.name ?? '')
    setType(agent.type ?? '')
    setDescription(agent.description ?? '')
    setSelectedIcon(agent.iconKey ?? undefined)
    setSelectedColor(agent.iconColor ?? DEFAULT_AGENT_COLOR)
    setPendingFile(null)
  }

  const isPending = update.isPending || iconUpload.isUploading
  const isDisabled = !canEdit || isPending

  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  const iconChanged =
    pendingFile !== null ||
    selectedIcon !== (agent.iconKey ?? undefined) ||
    selectedColor !== (agent.iconColor ?? DEFAULT_AGENT_COLOR)
  const isDirty =
    trimmedName !== (agent.name?.trim() ?? '') ||
    type !== (agent.type ?? '') ||
    trimmedDescription !== (agent.description?.trim() ?? '') ||
    iconChanged
  const canSubmit = canEdit && isDirty && trimmedName.length > 0 && !isPending

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSubmit) return

    // 1) If a custom file is pending, upload it first — the hook persists
    //    `iconKey` on its own, so we skip it from the PATCH payload below.
    if (pendingFile) {
      const uploaded = await iconUpload.upload(pendingFile)
      if (uploaded === null) {
        toast.error(t('agents.errorUpdate'))
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
    if (type !== (agent.type ?? '')) {
      input.type = (type as AgentType) || undefined
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
          <FormInput
            id="agent-name"
            label={t('agents.editName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isDisabled}
            maxLength={64}
          />

          <div>
            <label
              htmlFor="agent-type"
              className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
            >
              {t('agents.agentType')}
            </label>
            <div className="relative">
              <select
                id="agent-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isDisabled}
                className="w-full appearance-none rounded-lg border border-[var(--cv-input-border)]
                  bg-[var(--cv-input-bg)] pl-3 pr-10 py-2 text-[12px] text-[var(--cv-input-text)]
                  focus:border-[var(--cv-t1)] focus:outline-none transition-colors
                  disabled:cursor-not-allowed disabled:opacity-40"
              >
                <option value="">{t('agents.typePlaceholder')}</option>
                {typeValues.map((v) => (
                  <option key={v} value={v}>
                    {agentTypeLabelKey(v) ? t(agentTypeLabelKey(v)!) : v}
                  </option>
                ))}
              </select>
              <Icon
                name="expand_more"
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cv-t3)]"
              />
            </div>
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
