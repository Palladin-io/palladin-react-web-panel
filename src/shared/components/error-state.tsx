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
        border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.06)] p-8 text-center"
    >
      <p className="text-xs text-[#FF4F4F]">
        {message ?? t('errors.unexpectedError')}
      </p>
      <Button variant="danger" size="sm" icon="refresh" onClick={onRetry}>
        {t('common.reload')}
      </Button>
    </div>
  )
}
