import { GoogleOAuthProvider } from '@react-oauth/google'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorBoundary } from '../shared/components/error-boundary'
import { env } from '../shared/lib/env'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={env.googleClientId}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
