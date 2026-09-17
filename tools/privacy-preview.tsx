// Local-only actual-component preview. Never imports approved notices or enables capture.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useNavigate } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import '../src/index.css'
import i18n from '../src/shared/lib/i18n'
import { env } from '../src/shared/lib/env'
import { useAuthStore, SecurityPage } from '../src/features/auth'
import { ConsentRuntime, PrivacySettingsPage, PrivacyPrompt } from '../src/features/privacy'
import { SettingsLayout } from '../src/features/settings'
import { AuthStepShell } from '../src/shared/components/auth-step-shell'
import { Button } from '../src/shared/components/button'
import { AppWordmark } from '../src/shared/components/app-wordmark'

if (!import.meta.env.DEV || env.clientAnalyticsReleased || env.posthogKey || !env.apiUrl.startsWith('http://127.0.0.1:')) throw new Error('Local telemetry-free preview only')
const params = new URLSearchParams(location.search)
const locale = params.get('locale') === 'pl' ? 'pl' : 'en'
await i18n.changeLanguage(locale)
const userId = `fixture-web-${locale}${params.has('empty') ? '-empty' : ''}`
useAuthStore.setState({ userId, accessToken: userId, refreshToken: null })
await fetch(`${env.apiUrl}/reset`, { method: 'POST', headers: { Authorization: `Bearer ${userId}` } })
const client = new QueryClient()
export function Preview() {
  if (params.has('verify')) return <AuthStepShell showBrand align="center"
    title={i18n.t('verifyEmail.successTitle')} subtitle={i18n.t('verifyEmail.successSubtitle')}>
    <div className="flex flex-col items-center gap-4"><Button onClick={() => { location.href = '/tools/privacy-preview.html?locale=' + locale }}>{i18n.t('privacy.continue')}</Button></div>
  </AuthStepShell>
  return <QueryClientProvider client={client}>
    <ConsentRuntime />
    <div className="auth-surface flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4"><AppWordmark size="sm" /><span className="text-meta">TEST FIXTURE · capture off · {locale.toUpperCase()}</span></header>
      <div className="min-h-0 flex-1"><Outlet /></div>
    </div><Toaster />
  </QueryClientProvider>
}
const rootRoute = createRootRoute({ component: Preview, staticData: { consentSession: true } })
function PreviewHome() {
  const navigate = useNavigate()
  return <div className="flex h-full items-center justify-center">
    <Button size="sm" variant="outline" onClick={() => { void navigate({ to: '/settings/security' }) }}>{i18n.t('settings.title')}</Button>
  </div>
}
function Startup() {
  return <PrivacyPrompt fallback={<PreviewHome />} />
}

const startup = createRoute({ getParentRoute: () => rootRoute, path: '/tools/privacy-preview.html', component: Startup })
const settings = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: () => <><SettingsLayout /><PrivacyPrompt /></> })
const privacy = createRoute({ getParentRoute: () => settings, path: '/privacy', component: PrivacySettingsPage })
const security = createRoute({ getParentRoute: () => settings, path: '/security', component: SecurityPage })
const router = createRouter({ history: params.has('direct') ? createMemoryHistory({ initialEntries: ['/settings/privacy'] }) : undefined, routeTree: rootRoute.addChildren([startup, settings.addChildren([privacy, security])]) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
