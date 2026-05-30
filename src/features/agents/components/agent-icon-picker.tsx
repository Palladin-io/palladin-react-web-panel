import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { hexWithAlpha } from '../../vaults/components/vault-color'
import {
  AGENT_ICON_ALL,
  AGENT_ICON_COLORS,
  AGENT_ICON_OPTIONS,
} from './agent-presentation'

const COLOR_OPTIONS = [
  '#FF4F4F', '#FFAB87', '#60A5FA', '#2EC4B6', '#A78BFA', '#8A95A6',
] as const

export const DEFAULT_AGENT_COLOR = COLOR_OPTIONS[3]

export interface AgentIconPickerProps {
  value: string | undefined
  onChange: (next: string | undefined) => void
  selectedColor: string
  onColorChange?: (color: string) => void
  onFileSelected?: (file: File, previewUrl: string) => void
  disabled?: boolean
  rowClassName?: string
}

export function AgentIconPicker({
  value,
  onChange,
  selectedColor,
  onColorChange,
  onFileSelected,
  disabled = false,
  rowClassName = 'grid grid-cols-8 gap-2',
}: AgentIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  const isCustomUrl =
    typeof value === 'string' &&
    (value.startsWith('https://') || value.startsWith('blob:'))

  const presets = AGENT_ICON_OPTIONS as readonly string[]
  const isFromBrowser = !isCustomUrl && value !== undefined && !presets.includes(value)
  const visiblePresets = isFromBrowser ? presets.slice(0, presets.length - 1) : presets

  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {t('agents.agentIcon')}
      </legend>
      <div className={rowClassName}>
        {visiblePresets.map((opt) => {
          const selected = !isCustomUrl && opt === value
          const iconColor = AGENT_ICON_COLORS[opt] ?? '#8A95A6'
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(selected ? undefined : opt)}
              disabled={disabled}
              aria-pressed={selected}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: selected
                  ? hexWithAlpha(selectedColor, 0.25)
                  : hexWithAlpha(iconColor, 0.15),
                border: selected ? `2px solid ${selectedColor}` : 'none',
              }}
            >
              <Icon name={opt} size={16} color={selected ? selectedColor : iconColor} />
            </button>
          )
        })}

        {isFromBrowser && value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(value)}
            disabled={disabled}
            aria-pressed
            aria-label={value.replace(/_/g, ' ')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: hexWithAlpha(selectedColor, 0.25),
              border: `2px solid ${selectedColor}`,
            }}
          >
            <Icon name={value} size={16} color={selectedColor} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowBrowser(true)}
          disabled={disabled}
          aria-label={t('vault.iconMore')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
            transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: hexWithAlpha('#8A95A6', 0.15) }}
        >
          <Icon name="more_horiz" size={16} color="#8A95A6" />
        </button>
      </div>

      {onFileSelected && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const previewUrl = URL.createObjectURL(file)
                onFileSelected(file, previewUrl)
              }
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border
              border-dashed border-[var(--cv-input-border)] px-3 py-2.5 text-[11px]
              text-[var(--cv-t3)] transition-colors hover:border-[var(--cv-t1)]
              hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="upload" size={13} />
            <span>
              {isCustomUrl
                ? t('vault.entries.iconChange')
                : t('vault.entries.iconUpload')}
            </span>
          </button>
        </>
      )}

      {showBrowser && (
        <AgentIconBrowser
          currentIcon={isCustomUrl ? undefined : value}
          onSelectIcon={onChange}
          currentColor={onColorChange ? selectedColor : undefined}
          onSelectColor={onColorChange}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </fieldset>
  )
}

interface AgentIconBrowserProps {
  currentIcon: string | undefined
  onSelectIcon: (icon: string | undefined) => void
  currentColor: string | undefined
  onSelectColor: ((color: string) => void) | undefined
  onClose: () => void
}

function AgentIconBrowser({
  currentIcon,
  onSelectIcon,
  currentColor,
  onSelectColor,
  onClose,
}: AgentIconBrowserProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [localIcon, setLocalIcon] = useState<string | undefined>(currentIcon)
  const [localColor, setLocalColor] = useState<string | undefined>(currentColor)

  const query = search.toLowerCase().replace(/\s+/g, '_')
  const allIcons = AGENT_ICON_ALL as readonly string[]
  const filtered = query ? allIcons.filter((icon) => icon.includes(query)) : allIcons

  const handleConfirm = () => {
    onSelectIcon(localIcon)
    if (onSelectColor && localColor) onSelectColor(localColor)
    onClose()
  }

  return (
    <ModalShell onClose={onClose} ariaLabel={t('vault.iconBrowserTitle')} width={440}>
      <div className="flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('vault.iconBrowserTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="flex items-center gap-2 rounded-lg border border-[var(--cv-input-border)]
          bg-[var(--cv-input-bg)] px-3 py-2">
          <Icon name="search" size={14} color="var(--cv-t3)" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vault.iconBrowserSearch')}
            autoFocus
            className="flex-1 bg-transparent text-[12px] text-[var(--cv-input-text)]
              placeholder:text-[var(--cv-t3)] outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[var(--cv-t3)] hover:text-[var(--cv-t1)]"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {filtered.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
            {filtered.map((icon) => {
              const selected = icon === localIcon
              const iconColor = AGENT_ICON_COLORS[icon] ?? '#8A95A6'
              const accent = localColor ?? iconColor
              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setLocalIcon(icon)}
                  aria-label={icon.replace(/_/g, ' ')}
                  aria-pressed={selected}
                  className="flex h-10 w-full items-center justify-center rounded-xl
                    transition-colors hover:opacity-80"
                  style={{
                    background: selected
                      ? hexWithAlpha(accent, 0.18)
                      : hexWithAlpha(iconColor, 0.08),
                    border: selected ? `2px solid ${accent}` : '2px solid transparent',
                  }}
                >
                  <Icon name={icon} size={18} color={selected ? accent : iconColor} />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-[12px] text-[var(--cv-t3)]">
            {t('vault.iconBrowserEmpty')}
          </p>
        )}

        {onSelectColor && currentColor !== undefined && (
          <>
            <div className="h-px bg-[var(--cv-divider)]" />
            <div>
              <p className="mb-2 text-[11px] font-semibold text-[var(--cv-label-text)]">
                {t('vault.colorLabel')}
              </p>
              <div className="grid grid-cols-6 gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setLocalColor(opt)}
                    aria-pressed={opt === localColor}
                    className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: opt,
                      border: opt === localColor ? '2px solid var(--cv-t1)' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-1 flex items-center gap-2">
          <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleConfirm}
            disabled={localIcon === undefined}
            className="flex-[2]"
          >
            {t('vault.iconBrowserChoose')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
