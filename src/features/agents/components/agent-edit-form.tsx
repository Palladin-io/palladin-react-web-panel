import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import type { Agent } from '../api/agents-api'
import { useUpdateAgent } from '../use-update-agent'

export interface AgentEditFormProps {
  agent: Agent
  /** Called after a successful save so the parent can leave edit mode. */
  onSaved: () => void
  /** Called when the user discards edits. */
  onCancel: () => void
}

/**
 * Inline editor for an agent's display name and description. Sits inside
 * the detail panel; on save it PATCHes the agent and hands control back
 * to the parent via `onSaved`.
 */
export function AgentEditForm({ agent, onSaved, onCancel }: AgentEditFormProps) {
  const { t } = useTranslation()
  const update = useUpdateAgent()

  const [name, setName] = useState(agent.name ?? '')
  const [description, setDescription] = useState(agent.description ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isPending = update.isPending
  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  const canSubmit = trimmedName.length > 0 && !isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setErrorMessage(null)

    update.mutate(
      {
        agentId: agent.agentId,
        input: { name: trimmedName, description: trimmedDescription },
      },
      {
        onSuccess: () => {
          analytics.capture('agents', 'agent-updated')
          onSaved()
        },
        onError: () => {
          setErrorMessage(t('agents.errorUpdate'))
        },
      },
    )
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <FormInput
        id="agent-name"
        label={t('agents.editName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        disabled={isPending}
        maxLength={64}
        required
      />
      <FormTextarea
        id="agent-description"
        label={t('agents.editDescription')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isPending}
        maxLength={280}
        rows={3}
      />

      <FieldFeedback visible={errorMessage !== null} color="red">
        {errorMessage}
      </FieldFeedback>

      <div className="mt-1 flex items-center gap-2">
        <Button
          variant="subtle"
          size="md"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1"
        >
          {t('agents.cancel')}
        </Button>
        <Button
          variant="accent"
          size="md"
          type="submit"
          disabled={!canSubmit}
          className="flex-[2]"
        >
          {isPending ? t('agents.saving') : t('agents.editSave')}
        </Button>
      </div>
    </form>
  )
}
