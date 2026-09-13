// Local-only actual-component preview. Never imports approved notices or enables capture.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useNavigate } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import '../src/index.css'
import i18n from '../src/shared/lib/i18n'
import { env } from '../src/shared/lib/env'
import { useAuthStore } from '../src/features/auth'
import { ConsentRuntime, PrivacySettingsPage, PrivacyPrompt } from '../src/features/privacy'
import { ConsentChoices } from '../src/features/privacy/consent-choices'
import { SettingsLayout } from '../src/features/settings'
import { dismissPrivacyPrompt } from '../src/features/privacy/privacy-prompt-state'
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
  return <QueryClientProvider client={client}>
    <ConsentRuntime />
    <div className="auth-surface flex h-screen flex-col">
      <header className="flex items-center justify-between p-4"><AppWordmark size="sm" /><span className="text-meta">TEST FIXTURE · capture off · {locale.toUpperCase()}</span></header>
      <div className="min-h-0 flex-1"><Outlet /></div>
    </div><Toaster />
  </QueryClientProvider>
}
const rootRoute = createRootRoute({ component: Preview })
function Startup() {
  const navigate = useNavigate()
  return <ConsentChoices source="web_onboarding" onContinue={() => {
    dismissPrivacyPrompt(userId)
    void navigate({ to: '/settings/privacy' })
  }} />
}
const startup = createRoute({ getParentRoute: () => rootRoute, path: '/tools/privacy-preview.html', component: Startup })
const settings = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: () => <><SettingsLayout /><PrivacyPrompt /></> })
const privacy = createRoute({ getParentRoute: () => settings, path: '/privacy', component: PrivacySettingsPage })
const security = createRoute({ getParentRoute: () => settings, path: '/security', component: () => <p className="p-4">TEST FIXTURE · Settings navigation</p> })
const router = createRouter({ routeTree: rootRoute.addChildren([startup, settings.addChildren([privacy, security])]) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
