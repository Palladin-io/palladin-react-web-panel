import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen items-center justify-center bg-[#000B2E]">
            <div className="text-center">
              <h1 className="mb-2 text-xl font-bold text-[#FDF9E4]">
                Something went wrong
              </h1>
              <p className="mb-4 text-sm text-[#6B7A8E]">
                An unexpected error occurred. Please reload the page.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-[#FF4F4F] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#e04545]"
              >
                Reload
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
