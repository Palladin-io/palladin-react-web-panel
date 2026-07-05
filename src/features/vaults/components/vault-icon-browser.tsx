import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { Icon } from '../../../shared/components/icon'
import { VAULT_COLOR_OPTIONS, VAULT_COLOR_NAME_KEY } from './vault-presentation'
import { searchFavicons, type FaviconHit } from '../api/vault-api'
import { hexWithAlpha } from './vault-color'
import { ModalShell } from '../../../shared/components/modal-shell'

export interface IconColorBrowserProps {
  /** Show the shared brand/favicon section fed by the favicon index. */
  showBrandIcons?: boolean
  open: boolean
  onClose: () => void
  /** All browsable icons. */
  icons: readonly string[]
  iconColors: Record<string, string>
  currentIcon: string | undefined
  onSelectIcon: (icon: string | undefined) => void
  /** When provided the color section is rendered. */
  currentColor?: string
  onSelectColor?: (color: string) => void
  /** Grid columns for the icon grid (default 8). Pass 5 for small sets. */
  gridCols?: number
}

export function IconColorBrowser({
  open,
  onClose,
  icons,
  iconColors,
  currentIcon,
  onSelectIcon,
  currentColor,
  onSelectColor,
  gridCols = 8,
  showBrandIcons = false,
}: IconColorBrowserProps) {
  if (!open) return null
  return (
    <IconColorBrowserBody
      onClose={onClose}
      icons={icons}
      iconColors={iconColors}
      currentIcon={currentIcon}
      onSelectIcon={onSelectIcon}
      currentColor={currentColor}
      onSelectColor={onSelectColor}
      gridCols={gridCols}
      showBrandIcons={showBrandIcons}
    />
  )
}

function IconColorBrowserBody({
  onClose,
  icons,
  iconColors,
  currentIcon,
  onSelectIcon,
  currentColor,
  onSelectColor,
  gridCols,
  showBrandIcons,
}: Omit<IconColorBrowserProps, 'open'>) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [localIcon, setLocalIcon] = useState<string | undefined>(currentIcon)
  const [localColor, setLocalColor] = useState<string | undefined>(currentColor)
  const [brandIcons, setBrandIcons] = useState<FaviconHit[]>([])

  useEffect(() => {
    // Brand icons appear only while the user is actively searching — the
    // default view stays the curated glyph presets.
    if (!showBrandIcons || search.trim().length === 0) {
      setBrandIcons([])
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      const icons = await searchFavicons(search.trim())
      if (!cancelled) setBrandIcons(icons)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [search, showBrandIcons])

  const showSearch = icons.length > 15
  const query = search.toLowerCase().replace(/\s+/g, '_')
  const filtered = showSearch ? icons.filter((icon) => icon.includes(query)) : icons

  const handleConfirm = () => {
    onSelectIcon(localIcon)
    if (onSelectColor && localColor) onSelectColor(localColor)
    onClose()
  }

  return (
    <ModalShell
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
        {showSearch && (
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
        )}

        {showBrandIcons && brandIcons.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold text-[var(--cv-label-text)]">
              {t('vault.iconBrowserBrand')}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gap: '6px',
              }}
            >
              {brandIcons.map((hit) => {
                const selected = hit.iconUrl === localIcon
                const accent = localColor ?? 'var(--cv-primary)'
                return (
                  <button
                    key={hit.domain}
                    type="button"
                    onClick={() => setLocalIcon(hit.iconUrl)}
                    title={hit.domain}
                    aria-pressed={selected}
                    className="flex h-10 w-full items-center justify-center overflow-hidden rounded-xl
                      transition-colors hover:opacity-80"
                    style={{
                      background: selected ? hexWithAlpha('#8A95A6', 0.18) : hexWithAlpha('#8A95A6', 0.08),
                      border: selected ? `2px solid ${accent}` : '2px solid transparent',
                    }}
                  >
                    <img src={hit.iconUrl} alt={hit.domain} className="h-5 w-5 rounded object-contain" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: '6px',
            }}
          >
            {filtered.map((icon) => {
              const selected = icon === localIcon
              const iconColor = iconColors[icon] ?? '#8A95A6'
              const accent = localColor ?? iconColor
              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setLocalIcon(icon)}
                  aria-label={t(`vault.iconName.${icon}`, { defaultValue: icon.replace(/_/g, ' ') })}
                  aria-pressed={selected}
                  className="flex h-10 w-full items-center justify-center rounded-xl transition-colors
                    hover:opacity-80"
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
              <div className="flex justify-between">
                {VAULT_COLOR_OPTIONS.map((opt) => {
                  const selected = opt === localColor
                  const colorName = t(`vault.colorName.${VAULT_COLOR_NAME_KEY[opt] ?? 'custom'}`)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setLocalColor(opt)}
                      aria-label={t('vault.colorOption', { name: colorName })}
                      aria-pressed={selected}
                      className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: opt,
                        border: selected ? '2px solid var(--cv-t1)' : '2px solid transparent',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </>
        )}

      </div>
    </ModalShell>
  )
}
