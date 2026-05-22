import { useRef, useState, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FieldFeedback } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import {
  AGENT_TYPE_AIDER,
  AGENT_TYPE_CLAUDE_CODE,
  AGENT_TYPE_CLINE,
  AGENT_TYPE_CODEX,
  AGENT_TYPE_COPILOT,
  AGENT_TYPE_CURSOR,
  AGENT_TYPE_DEVIN,
  AGENT_TYPE_GEMINI,
  AGENT_TYPE_HERMES,
  AGENT_TYPE_KIMI_CODE,
  AGENT_TYPE_OPEN_CLAW,
  AGENT_TYPE_OTHER,
  AGENT_TYPE_ROO,
  type AgentType,
} from '../api/agents-api'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'

export interface ApproveAgentDialogProps {
  open: boolean
  agentName: string
  isPending: boolean
  onConfirm: (input: {
    name?: string
    type?: AgentType
    iconKey?: string
    iconColor?: string
  }) => void
  onCancel: () => void
}

const TYPE_OPTIONS: { value: AgentType; labelKey: string }[] = [
  { value: AGENT_TYPE_AIDER,      labelKey: 'agents.typeAider' },
  { value: AGENT_TYPE_CLAUDE_CODE, labelKey: 'agents.typeClaudeCode' },
  { value: AGENT_TYPE_CLINE,      labelKey: 'agents.typeCline' },
  { value: AGENT_TYPE_CODEX,      labelKey: 'agents.typeCodex' },
  { value: AGENT_TYPE_COPILOT,    labelKey: 'agents.typeCopilot' },
  { value: AGENT_TYPE_CURSOR,     labelKey: 'agents.typeCursor' },
  { value: AGENT_TYPE_DEVIN,      labelKey: 'agents.typeDevin' },
  { value: AGENT_TYPE_GEMINI,     labelKey: 'agents.typeGemini' },
  { value: AGENT_TYPE_HERMES,     labelKey: 'agents.typeHermes' },
  { value: AGENT_TYPE_KIMI_CODE,  labelKey: 'agents.typeKimiCode' },
  { value: AGENT_TYPE_OPEN_CLAW,  labelKey: 'agents.typeOpenClaw' },
  { value: AGENT_TYPE_ROO,        labelKey: 'agents.typeRoo' },
  { value: AGENT_TYPE_OTHER,      labelKey: 'agents.typeOther' },
]

// ---------------------------------------------------------------------------
// Combobox — suggestions from TYPE_OPTIONS, but free-form input allowed
// ---------------------------------------------------------------------------

interface AgentTypeComboboxProps {
  inputValue: string
  onInputChange: (text: string) => void
  onSelect: (value: string, label: string) => void
  disabled?: boolean
}

function AgentTypeCombobox({ inputValue, onInputChange, onSelect, disabled }: AgentTypeComboboxProps) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)

  const filtered = inputValue.trim()
    ? TYPE_OPTIONS.filter(({ labelKey }) =>
        t(labelKey).toLowerCase().includes(inputValue.toLowerCase())
      )
    : TYPE_OPTIONS

  return (
    <div>
      <label
        htmlFor="approve-agent-type"
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {t('agents.agentType')}
      </label>
      <div className="relative">
        <input
          id="approve-agent-type"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          value={inputValue}
          onChange={(e) => { onInputChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={t('agents.typePlaceholder')}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] px-3 py-2 pr-9 text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:border-[var(--cv-t1)] focus:outline-none transition-colors
            disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Icon name="expand_more" size={16} color="var(--cv-t3)" />
        </div>

        {open && filtered.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto
              rounded-lg border border-[var(--cv-border)] bg-[var(--cv-card-bg)] py-1
              shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
          >
            {filtered.map(({ value, labelKey }) => (
              <li key={value} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect(value, t(labelKey))
                    setOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left text-[12px] text-[var(--cv-t1)]
                    transition-colors hover:bg-[var(--cv-btn-subtle-hover)]"
                >
                  {t(labelKey)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export function ApproveAgentDialog({
  open,
  agentName,
  isPending,
  onConfirm,
  onCancel,
}: ApproveAgentDialogProps) {
  const { t } = useTranslation()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [typeInput, setTypeInput] = useState('')
  const [typeValue, setTypeValue] = useState('')
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(undefined)
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_AGENT_COLOR)

  if (!open) return null

  const handleConfirm = () => {
    if (!name.trim()) {
      setNameError(true)
      nameRef.current?.focus()
      return
    }
    onConfirm({
      name: name.trim(),
      type: (typeValue.trim() as AgentType) || undefined,
      iconKey: selectedIcon,
      iconColor: selectedIcon ? selectedColor : undefined,
    })
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
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

        {/* Name — required */}
        <div className="-mb-3">
          <label
            htmlFor="approve-agent-name"
            className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
          >
            {t('agents.agentName')}
          </label>
          <input
            ref={nameRef}
            id="approve-agent-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(false) }}
            disabled={isPending}
            className={`w-full rounded-lg border bg-[var(--cv-input-bg)] px-3 py-2 text-[12px]
              text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)]
              focus:outline-none transition-colors
              ${nameError
                ? 'border-[#FF4F4F] focus:border-[#FF4F4F]'
                : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
              } disabled:cursor-not-allowed disabled:opacity-40`}
          />
          <FieldFeedback visible={nameError} color="red">
            {t('agents.typeNameError')}
          </FieldFeedback>
        </div>

        {/* Type — combobox: predefined suggestions + free-form input */}
        <AgentTypeCombobox
          inputValue={typeInput}
          disabled={isPending}
          onInputChange={(text) => { setTypeInput(text); setTypeValue(text) }}
          onSelect={(value, label) => { setTypeValue(value); setTypeInput(label) }}
        />

        <AgentIconPicker
          value={selectedIcon}
          onChange={setSelectedIcon}
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
          onFileSelected={(_file, previewUrl) => setSelectedIcon(previewUrl)}
          disabled={isPending}
        />
      </div>

      {/* Footer strip — same treatment as agent card footer */}
      <div
        className="-mx-6 -mb-6 mt-4 flex items-center gap-2
          rounded-b-2xl border-t border-[var(--cv-divider)]
          bg-[rgba(0,11,46,0.015)] px-6 py-4
          dark:bg-[rgba(253,249,228,0.02)]"
      >
        <Button
          variant="subtle"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1"
        >
          {t('agents.cancel')}
        </Button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="flex flex-[2] cursor-pointer items-center justify-center gap-1.5
            rounded-lg border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)]
            px-2.5 py-1.5 text-[11px] font-semibold text-[#2EC4B6]
            transition-colors hover:bg-[rgba(46,196,182,0.12)]
            disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check_circle" size={14} />
          {isPending ? t('agents.approving') : t('agents.approve')}
        </button>
      </div>
    </ModalShell>
  )
}
