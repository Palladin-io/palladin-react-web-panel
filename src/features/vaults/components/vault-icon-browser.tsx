import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { Icon } from '../../../shared/components/icon'
import { VAULT_COLOR_OPTIONS, VAULT_COLOR_NAME_KEY } from './vault-presentation'
import { hexWithAlpha } from './vault-color'
import { ModalShell } from '../../../shared/components/modal-shell'
import { SearchBar } from '../../../shared/components/search-bar'
import { searchPublicAssets, type PublicAsset } from '../../../shared/api/public-assets-api'

export interface IconColorBrowserProps {
  /** Legacy flag retained for caller compatibility; remote favicon lookup is disabled. */
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
  const [publicAssets, setPublicAssets] = useState<PublicAsset[]>([])

  useEffect(() => {
    const query = search.trim()
    if (!showBrandIcons || query.length < 2) {
      setPublicAssets([])
      return
    }
    let current = true
    const timer = window.setTimeout(() => {
      void searchPublicAssets(query)
        .then((items) => { if (current) setPublicAssets(items) })
        .catch(() => { if (current) setPublicAssets([]) })
    }, 250)
    return () => {
      current = false
      window.clearTimeout(timer)
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
        )}

        {filtered.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: '0.375rem',
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
          <p className="py-6 text-center text-ui text-[var(--cv-t3)]">
            {t('vault.iconBrowserEmpty')}
          </p>
        )}

        {showBrandIcons && publicAssets.length > 0 ? (
          <div className="grid grid-cols-8 gap-1.5 border-t border-[var(--cv-divider)] pt-3">
            {publicAssets.map((asset) => {
              const reference = `public-asset:${asset.id}`
              const selected = reference === localIcon
              return (
                <button
                  key={asset.id}
                  type="button"
                  title={asset.name}
                  aria-label={asset.name}
                  aria-pressed={selected}
                  onClick={() => setLocalIcon(reference)}
                  className="flex h-10 items-center justify-center rounded-xl border transition-colors hover:bg-[var(--cv-card-hover)]"
                  style={{ borderColor: selected ? 'var(--cv-primary)' : 'transparent' }}
                >
                  <img src={asset.url} alt="" className="h-5 w-5 rounded object-contain" />
                </button>
              )
            })}
          </div>
        ) : null}

        {onSelectColor && currentColor !== undefined && (
          <>
            <div className="h-px bg-[var(--cv-divider)]" />
            <div>
              <p className="mb-2 text-meta font-semibold text-[var(--cv-label-text)]">
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
