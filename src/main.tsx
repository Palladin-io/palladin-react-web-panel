import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './index.css'
import './shared/lib/i18n'
import { StartupError } from './shared/components/startup-error'
import { findMissingRequiredClientEnv } from './shared/lib/required-client-env'
import { clearPendingEntryShare } from './shared/lib/entry-share-ingress'
import { installEntryShareNavigation } from './shared/lib/entry-share-navigation'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing application root element')

const root = createRoot(rootElement)
const missingEnvironmentKeys = findMissingRequiredClientEnv(import.meta.env)
let sharingIngressReady = false
try {
  installEntryShareNavigation(window, () => {
    sharingIngressReady = false
    renderStartupError()
  })
  sharingIngressReady = true
} catch {
  // A failed URL scrub must stop startup before the router or analytics is imported.
}

function renderStartupError(missingKeys: readonly string[] = []) {
  clearPendingEntryShare()
  root.render(
    <StrictMode>
      <StartupError missingKeys={missingKeys} />
    </StrictMode>,
  )
}

async function startApplication(applicationRoot: Root): Promise<void> {
  const [{ default: App }, { analytics }] = await Promise.all([
    import('./App.tsx'),
    import('./shared/lib/analytics.ts'),
  ])
  if (!sharingIngressReady) return

  analytics.reset()
  const { clearLegacyAnalytics } = await import('./shared/lib/clear-legacy-analytics.ts')
  if (!sharingIngressReady) return
  clearLegacyAnalytics()
  applicationRoot.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if (!sharingIngressReady || missingEnvironmentKeys.length > 0) {
  renderStartupError(missingEnvironmentKeys)
} else {
  void startApplication(root).catch(() => {
    console.error('Palladin application bootstrap failed')
    renderStartupError()
  })
}
