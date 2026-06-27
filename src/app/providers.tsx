import { GoogleOAuthProvider } from '@react-oauth/google'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLayoutEffect, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '../shared/components/error-boundary'
import { env } from '../shared/lib/env'
import { useThemeStore } from '../shared/stores/theme-store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function ThemeSync() {
  const theme = useThemeStore((s) => s.theme)
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  // Drive Sonner from our own store rather than `"system"` so the toast
  // theme tracks the in-app toggle, not the OS preference (otherwise a
  // user with a light OS but dark app would get a light toast on a dark UI).
  const theme = useThemeStore((s) => s.theme)
  return (
    <ErrorBoundary>
      <ThemeSync />
      <GoogleOAuthProvider clientId={env.googleClientId}>
        <QueryClientProvider client={queryClient}>
          {children}
          {/* Single Toaster mounted at the app root — feature components
              call `toast(...)` from sonner without needing to mount their
              own provider. Matches the active app theme via CSS variables. */}
          <Toaster
            theme={theme}
            position="top-right"
            closeButton
            toastOptions={{ className: 'cv-toast' }}
          />
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
