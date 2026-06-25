import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import i18n from '../lib/i18n'
import { Button } from './button'

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
          <div className="flex min-h-screen items-center justify-center bg-[#0C0E12]">
            <div className="text-center">
              <h1 className="mb-2 text-xl font-bold text-[#FDF9E4]">
                {i18n.t('errors.somethingWentWrong')}
              </h1>
              <p className="mb-4 text-sm text-[#6B7A8E]">
                {i18n.t('errors.unexpectedError')}
              </p>
              <Button
                variant="accent"
                size="sm"
                onClick={() => window.location.reload()}
              >
                {i18n.t('common.reload')}
              </Button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
