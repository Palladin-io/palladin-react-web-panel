import { useTranslation } from 'react-i18next'
import { Button } from './button'

export interface ErrorStateProps {
  message?: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl border
        border-[rgb(var(--cv-primary-rgb)/0.3)] bg-[rgb(var(--cv-primary-rgb)/0.06)] p-8 text-center"
    >
      <p className="text-xs text-[var(--cv-primary)]">
        {message ?? t('errors.unexpectedError')}
      </p>
      <Button variant="danger" size="sm" icon="refresh" onClick={onRetry}>
        {t('common.reload')}
      </Button>
    </div>
  )
}
