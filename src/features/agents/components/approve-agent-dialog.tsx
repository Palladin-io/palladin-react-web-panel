import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import {
  AGENT_TYPE_CLAUDE_CODE,
  AGENT_TYPE_HERMES,
  AGENT_TYPE_OPEN_CLAW,
  AGENT_TYPE_OTHER,
  type AgentType,
} from '../api/agents-api'

export interface ApproveAgentDialogProps {
  open: boolean
  agentName: string
  isPending: boolean
  onConfirm: (input: {
    name?: string
    type?: AgentType
    iconKey?: string
  }) => void
  onCancel: () => void
}

/** Material icon glyphs offered as preset agent icons. */
const ICON_OPTIONS = [
  'smart_toy',
  'memory',
  'hub',
  'token',
  'terminal',
  'code',
  'psychology',
  'auto_mode',
] as const

const TYPE_OPTIONS: { value: AgentType; labelKey: string }[] = [
  { value: AGENT_TYPE_OPEN_CLAW, labelKey: 'agents.typeOpenClaw' },
  { value: AGENT_TYPE_CLAUDE_CODE, labelKey: 'agents.typeClaudeCode' },
  { value: AGENT_TYPE_HERMES, labelKey: 'agents.typeHermes' },
  { value: AGENT_TYPE_OTHER, labelKey: 'agents.typeOther' },
]

/**
 * Approval dialog for a pending agent. Approval grants the agent access
 * to organization vaults, so it is gated behind an explicit confirm
 * step. The admin can optionally set a name, type, and icon while
 * approving.
 */
export function ApproveAgentDialog({
  open,
  agentName,
  isPending,
  onConfirm,
  onCancel,
}: ApproveAgentDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [selectedType, setSelectedType] = useState<AgentType | null>(null)
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null)

  if (!open) return null

  const handleConfirm = () => {
    onConfirm({
      name: name.trim() || undefined,
      type: selectedType ?? undefined,
      iconKey: selectedIcon ?? undefined,
    })
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.approveSetup')}
      width={420}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('agents.approveSetup')}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cv-t2)]">
            {t('agents.approveConfirmBody', { name: agentName })}
          </p>
          <p className="mt-1 text-[11px] text-[var(--cv-t3)]">
            {t('agents.approveSetupHint')}
          </p>
        </div>

        <FormInput
          id="approve-agent-name"
          label={t('agents.agentName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
        />

        <div>
          <span className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]">
            {t('agents.agentType')}
          </span>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map(({ value, labelKey }) => {
              const isSelected = selectedType === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    setSelectedType(isSelected ? null : value)
                  }
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[11px]
                    font-semibold transition-colors ${
                    isSelected
                      ? 'border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)] text-[var(--cv-t1)]'
                      : 'border-[var(--cv-border)] text-[var(--cv-t3)]'
                  }`}
                >
                  {t(labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]">
            {t('agents.agentIcon')}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {ICON_OPTIONS.map((iconKey) => {
              const isSelected = selectedIcon === iconKey
              return (
                <button
                  key={iconKey}
                  type="button"
                  disabled={isPending}
                  aria-label={iconKey}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedIcon(isSelected ? null : iconKey)
                  }
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center
                    rounded-lg transition-colors ${
                    isSelected
                      ? 'border border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]'
                      : 'border border-transparent hover:border-[var(--cv-border)]'
                  }`}
                >
                  <Icon
                    name={iconKey}
                    size={20}
                    color={
                      isSelected ? 'var(--cv-t1)' : 'var(--cv-t3)'
                    }
                  />
                </button>
              )
            })}
          </div>
        </div>

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
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-[2]"
          >
            {isPending ? t('agents.approving') : t('agents.approve')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
