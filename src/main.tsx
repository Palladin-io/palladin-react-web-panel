import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './index.css'
import './shared/lib/i18n'
import { StartupError } from './shared/components/startup-error'
import { findMissingRequiredClientEnv } from './shared/lib/required-client-env'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing application root element')

const root = createRoot(rootElement)
const missingEnvironmentKeys = findMissingRequiredClientEnv(import.meta.env)

function renderStartupError(missingKeys: readonly string[] = []) {
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

  analytics.reset()
  const { clearLegacyAnalytics } = await import('./shared/lib/clear-legacy-analytics.ts')
  clearLegacyAnalytics()
  applicationRoot.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if (missingEnvironmentKeys.length > 0) {
  renderStartupError(missingEnvironmentKeys)
} else {
  void startApplication(root).catch(() => {
    console.error('Palladin application bootstrap failed')
    renderStartupError()
  })
}
