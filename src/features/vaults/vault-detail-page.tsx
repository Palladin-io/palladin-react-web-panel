import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { GRANT_MODE_FULL } from './types'
import { useVault } from './use-vault'

const PAGE_BACKGROUND =
  'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)'

const DEFAULT_ACCENT = '#2EC4B6'
const DEFAULT_ICON = '🔒'

export interface VaultDetailPageProps {
  vaultId: string
}

export function VaultDetailPage({ vaultId }: VaultDetailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)

  return (
    <div className="min-h-screen text-[#FDF9E4]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button
          type="button"
          onClick={() => navigate({ to: '/vaults' })}
          className="mb-6 text-[12px] text-[#6B7A8E] transition-colors hover:text-[#FDF9E4]"
        >
          ← {t('vault.backToList')}
        </button>

        {vault.isPending ? (
          <div className="h-24 animate-pulse rounded-2xl bg-[#1A2A4A]" />
        ) : vault.isError || !vault.data ? (
          <div className="rounded-2xl border border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.06)] p-6 text-sm text-[#FF4F4F]">
            {t('vault.errorLoad')}
          </div>
        ) : (
          <>
            <Header
              icon={vault.data.icon ?? DEFAULT_ICON}
              accent={vault.data.color ?? DEFAULT_ACCENT}
              name={vault.data.name}
              description={vault.data.description}
              isFull={vault.data.grantMode === GRANT_MODE_FULL}
              vaultId={vault.data.id}
            />

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section title={t('vault.entriesSection')}>
                <Empty message={t('vault.noEntries')} />
              </Section>
              <Section title={t('vault.agentsSection')}>
                <Empty message={t('vault.noAgents')} />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface HeaderProps {
  icon: string
  accent: string
  name: string
  description: string | null
  isFull: boolean
  vaultId: string
}

function Header({ icon, accent, name, description, isFull, vaultId }: HeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[rgba(253,249,228,0.08)] bg-[#1A2A4A] p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: `${accent}1F`, color: accent }}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold text-[#FDF9E4]">{name}</h1>
            <ModeBadge isFull={isFull} />
          </div>
          {description ? (
            <p className="mt-1 text-sm text-[#B8C5D4]">{description}</p>
          ) : null}
        </div>
      </div>

      <Link
        to="/vaults/$vaultId/settings"
        params={{ vaultId }}
        className="rounded-lg border border-[rgba(253,249,228,0.1)] bg-transparent px-4 py-2
          text-sm text-[#FDF9E4] transition-colors hover:bg-[rgba(253,249,228,0.04)]"
      >
        {t('vault.settings')}
      </Link>
    </div>
  )
}

function ModeBadge({ isFull }: { isFull: boolean }) {
  const { t } = useTranslation()
  const color = isFull ? '#F59E0B' : '#2EC4B6'
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{
        borderColor: `${color}66`,
        color,
        backgroundColor: `${color}1F`,
      }}
    >
      {isFull ? t('vault.modeFull') : t('vault.modeGranular')}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[rgba(253,249,228,0.08)] bg-[#1A2A4A] p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-[#B8C5D4]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm text-[#6B7A8E]">{message}</p>
}
