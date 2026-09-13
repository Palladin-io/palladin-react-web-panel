// Local-only actual-component preview. Never imports approved notices or enables capture.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { Toaster } from 'sonner'
import '../src/index.css'
import i18n from '../src/shared/lib/i18n'
import { env } from '../src/shared/lib/env'
import { useAuthStore } from '../src/features/auth'
import { ConsentRuntime, PrivacySettingsPage } from '../src/features/privacy'
import { ConsentChoices } from '../src/features/privacy/consent-choices'
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
  const [dialog, showDialog] = useState(params.get('screen') !== 'settings')
  return <QueryClientProvider client={client}>
    <ConsentRuntime />
    <div className="auth-surface flex h-screen flex-col">
      <header className="flex items-center justify-between p-4"><AppWordmark size="sm" /><span className="text-meta">TEST FIXTURE · capture off · {locale.toUpperCase()}</span></header>
      <div className="min-h-0 flex-1">{!dialog && <PrivacySettingsPage />}</div>
      {dialog && <ConsentChoices source="web_onboarding" onContinue={() => showDialog(false)} />}
    </div><Toaster />
  </QueryClientProvider>
}
const rootRoute = createRootRoute({ component: Preview })
const router = createRouter({ routeTree: rootRoute })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
