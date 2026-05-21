import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../features/auth'
import { Button } from '../../shared/components/button'

export const Route = createFileRoute('/_authenticated/')({
  component: AuthenticatedHome,
})

/**
 * Class string mirrors `<Button variant="accent" size="sm">` so a router
 * `<Link>` (which can't render a `<button>`) shares the same chrome as
 * the rest of the app's primary actions. Keeping it inline here — at a
 * single call site — avoids inventing a generic `LinkButton` wrapper for
 * one place; if a second caller appears, lift it into shared/components.
 */
const ACCENT_LINK_CLASS =
  'inline-flex items-center justify-center px-2.5 py-1.5 text-[11px] font-semibold ' +
  'rounded-lg gap-1.5 bg-[#FF4F4F] text-white transition-colors hover:bg-[#E04545]'

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
          <Link to="/vaults" className={ACCENT_LINK_CLASS}>
            {t('vault.title')}
          </Link>
          <Button variant="outline" onClick={handleLogout}>
            {t('common.logout')}
          </Button>
        </div>
      </div>
    </div>
  )
}
