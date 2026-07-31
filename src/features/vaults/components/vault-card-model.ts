import type { TFunction } from 'i18next'

export interface VaultCardModel {
  id: string
  name: string
  icon: string | null
  color: string | null
  createdAt: string
  updatedAt: string
  entryCount: number
  activeGrantCount: number
}

function formatRelativeUpdate(iso: string, locale: string, t: TFunction): string | null {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null

  const diffMs = Date.now() - ts
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return t('vault.relativeJustNow')
  if (minutes < 60) return t('vault.relativeMinutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('vault.relativeHoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('vault.relativeDaysAgo', { count: days })
  return new Date(ts).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function vaultFooterLabel(
  vault: Pick<VaultCardModel, 'updatedAt' | 'createdAt'>,
  locale: string,
  t: TFunction,
): string | null {
  const updatedRel = formatRelativeUpdate(vault.updatedAt, locale, t)
  if (updatedRel) return t('vault.relativeUpdatedLabel', { time: updatedRel })
  const createdRel = formatRelativeUpdate(vault.createdAt, locale, t)
  if (createdRel) return t('vault.relativeCreatedLabel', { time: createdRel })
  return null
}
