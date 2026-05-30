import { useState, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import {
  BUILTIN_AGENT_TYPES,
  presignAgentIcon,
  type AgentType,
} from '../api/agents-api'
import { useAgentTypes } from '../use-agent-types'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'

export interface ApproveAgentDialogProps {
  open: boolean
  agentName: string
  agentId: string
  /** Pre-fills the name input — the agent's existing name if set. */
  initialName?: string
  isPending: boolean
  onConfirm: (input: {
    name?: string
    type?: AgentType
    iconKey?: string
    iconColor?: string
  }) => void
  onCancel: () => void
}

/** i18n label keys for built-in types — custom types show their raw value. */
const BUILTIN_LABEL_KEYS: Record<string, string> = {
  aider:      'agents.typeAider',
  claudeCode: 'agents.typeClaudeCode',
  cline:      'agents.typeCline',
  codex:      'agents.typeCodex',
  copilot:    'agents.typeCopilot',
  cursor:     'agents.typeCursor',
  devin:      'agents.typeDevin',
  gemini:     'agents.typeGemini',
  hermes:     'agents.typeHermes',
  kimiCode:   'agents.typeKimiCode',
  openClaw:   'agents.typeOpenClaw',
  roo:        'agents.typeRoo',
  other:      'agents.typeOther',
}

// ---------------------------------------------------------------------------
// Combobox — suggestions from API (with built-in fallback), free-form allowed
// ---------------------------------------------------------------------------

interface AgentTypeComboboxProps {
  typeValues: string[]
  inputValue: string
  onInputChange: (text: string) => void
  onSelect: (value: string, label: string) => void
  disabled?: boolean
}

function typeLabel(value: string, t: (key: string) => string): string {
  const key = BUILTIN_LABEL_KEYS[value]
  return key ? t(key) : value
}

function AgentTypeCombobox({ typeValues, inputValue, onInputChange, onSelect, disabled }: AgentTypeComboboxProps) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)

  const filtered = inputValue.trim()
    ? typeValues.filter((v) => typeLabel(v, t).toLowerCase().includes(inputValue.toLowerCase()))
    : typeValues

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
              rounded-lg border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1
              shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          >
            {filtered.map((value) => (
              <li key={value} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect(value, typeLabel(value, t))
                    setOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left text-[12px] text-[var(--cv-t1)]
                    transition-colors hover:bg-[var(--cv-list-item-hover)]"
                >
                  {typeLabel(value, t)}
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
  agentId,
  initialName = '',
  isPending,
  onConfirm,
  onCancel,
}: ApproveAgentDialogProps) {
  const { t } = useTranslation()
  const agentTypes = useAgentTypes()
  const [name, setName] = useState(initialName)
  const [typeInput, setTypeInput] = useState('')
  const [typeValue, setTypeValue] = useState('')
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(undefined)
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_AGENT_COLOR)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  if (!open) return null

  const typeValues = agentTypes.data ?? BUILTIN_AGENT_TYPES

  const handleConfirm = async () => {
    let iconKey = selectedIcon

    // Custom file: upload to S3 before confirming so the persisted iconKey
    // is the public URL — not the throwaway blob: preview.
    if (pendingFile) {
      setIsUploading(true)
      try {
        const ext =
          pendingFile.type === 'image/png'
            ? 'png'
            : pendingFile.type === 'image/webp'
              ? 'webp'
              : 'jpg'
        const { uploadUrl, publicUrl } = await presignAgentIcon(agentId, ext)
        const res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': pendingFile.type },
          body: pendingFile,
        })
        if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
        iconKey = `${publicUrl}?v=${Date.now()}`
      } catch {
        setIsUploading(false)
        toast.error(t('vault.iconUploadError.failed'))
        return
      }
      setIsUploading(false)
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
        <div>
          <label
            htmlFor="approve-agent-name"
            className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
          >
            {t('agents.agentName')}
          </label>
          <input
            id="approve-agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            placeholder={t('agents.agentNamePlaceholder')}
            className="w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
              px-3 py-2 text-[12px] text-[var(--cv-input-text)]
              placeholder:text-[var(--cv-input-placeholder)]
              focus:border-[var(--cv-t1)] focus:outline-none transition-colors
              disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>

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
          disabled={isPending || isUploading}
          className="flex-1"
        >
          {t('agents.cancel')}
        </Button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || isUploading}
          className="flex flex-[2] cursor-pointer items-center justify-center gap-1.5
            rounded-lg border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)]
            px-2.5 py-1.5 text-[11px] font-semibold text-[#2EC4B6]
            transition-colors hover:bg-[rgba(46,196,182,0.12)]
            disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check_circle" size={14} />
          {isPending || isUploading ? t('agents.approving') : t('agents.approve')}
        </button>
      </div>
    </ModalShell>
  )
}
