import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../features/auth'

export const Route = createFileRoute('/_authenticated/')({
  component: AuthenticatedHome,
})

function AuthenticatedHome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  function handleLogout() {
    logout()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-6 text-2xl font-bold">{t('common.dashboardComingSoon')}</h1>
        <div className="flex items-center justify-center gap-2">
          <Link
            to="/vaults"
            className="rounded-lg bg-[#2EC4B6] px-4 py-2 text-sm font-semibold text-[#000B2E]
              transition-colors hover:bg-[#26a89d]"
          >
            {t('vault.title')}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)]
              px-4 py-2 text-sm text-[#FDF9E4] transition-colors hover:bg-[rgba(253,249,228,0.08)]"
          >
            {t('common.logout')}
          </button>
        </div>
      </div>
    </div>
  )
}
