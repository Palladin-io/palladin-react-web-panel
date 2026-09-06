import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { SearchBar } from '../../../shared/components/search-bar'
import { hexWithAlpha } from '../../vaults/components/vault-color'
import {
  AGENT_ICON_ALL,
  AGENT_ICON_COLORS,
  AGENT_ICON_OPTIONS,
  isCustomAgentIcon,
} from './agent-presentation'

const COLOR_OPTIONS = [
  '#EB4747', '#FFAB87', '#60A5FA', '#10B981', '#A78BFA', '#8A95A6',
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

  const isCustomUrl: boolean = isCustomAgentIcon(value)

  const presets = AGENT_ICON_OPTIONS as readonly string[]
  const isFromBrowser =
    value !== undefined && !isCustomUrl && !presets.includes(value)
  const visiblePresets = isFromBrowser ? presets.slice(0, presets.length - 1) : presets

  return (
    <fieldset>
      <legend className="mb-2 block text-meta font-semibold text-[var(--cv-label-text)]">
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
              aria-label={t(`vault.iconName.${opt}`, { defaultValue: opt.replace(/_/g, ' ') })}
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

        {isCustomUrl && value !== undefined && (
          <button
            type="button"
            disabled={disabled}
            aria-pressed
            aria-label={t('agents.agentIcon')}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden
              rounded-xl transition-transform hover:scale-105
              disabled:cursor-not-allowed disabled:opacity-40"
            style={{ border: `2px solid ${selectedColor}` }}
          >
            <img src={value} alt="" className="h-full w-full rounded-lg object-cover" />
          </button>
        )}

        {isFromBrowser && value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border
            border-[var(--cv-primary)] transition-transform hover:scale-105
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="more_horiz" size={16} color="var(--cv-primary)" />
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
              border-dashed border-[var(--cv-input-border)] px-3 py-2.5 text-meta
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
  onFileSelected?: (file: File) => boolean
  currentIcon: string | undefined
  onSelectIcon: (icon: string | undefined) => void
  currentColor: string | undefined
  onSelectColor: ((color: string) => void) | undefined
  onClose: () => void
}

export function AgentIconBrowser({
  onFileSelected,
  currentIcon,
  onSelectIcon,
  currentColor,
  onSelectColor,
  onClose,
}: AgentIconBrowserProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const uploadInputRef = useRef<HTMLInputElement>(null)
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
    <ModalShell
      trapFocus
      onClose={onClose}
      ariaLabel={t('vault.iconBrowserTitle')}
      title={t('vault.iconBrowserTitle')}
      width={440}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button variant="accent" size="sm" onClick={handleConfirm} disabled={localIcon === undefined} className="flex-[2]">
            {t('vault.iconBrowserChoose')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        {onFileSelected && (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={t('vault.entries.iconUpload')}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file && onFileSelected(file)) onClose()
              }}
            />
            <Button variant="subtle" size="sm" icon="upload" onClick={() => uploadInputRef.current?.click()}>
              {t('vault.entries.iconUpload')}
            </Button>
          </>
        )}
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t('vault.iconBrowserSearch')}
          autoFocus
          className=""
          trailing={search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[var(--cv-t3)] hover:text-[var(--cv-t1)]"
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        />

        {filtered.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.375rem' }}>
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
          <p className="py-6 text-center text-ui text-[var(--cv-t3)]">
            {t('vault.iconBrowserEmpty')}
          </p>
        )}

        {onSelectColor && currentColor !== undefined && (
          <>
            <div className="h-px bg-[var(--cv-divider)]" />
            <div>
              <p className="mb-2 text-meta font-semibold text-[var(--cv-label-text)]">
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

      </div>
    </ModalShell>
  )
}
