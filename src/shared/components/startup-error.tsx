import { useTranslation } from 'react-i18next'
import { AppWordmark } from './app-wordmark'
import { Button } from './button'

interface StartupErrorProps {
  missingKeys?: readonly string[]
}

export function StartupError({ missingKeys = [] }: StartupErrorProps) {
  const { t } = useTranslation()
  const hasConfigurationError = missingKeys.length > 0

  return (
    <main className="auth-surface flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[27.5rem] text-center">
        <div className="mb-5 flex justify-center">
          <AppWordmark size="lg" />
        </div>

        <section
          role="alert"
          className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-6"
        >
          <h2 className="text-heading font-semibold text-[var(--cv-t1)]">
            {t(
              hasConfigurationError
                ? 'startup.configurationTitle'
                : 'startup.genericTitle',
            )}
          </h2>
          <p className="mt-2 text-meta text-[var(--cv-t2)]">
            {t(
              hasConfigurationError
                ? 'startup.configurationDescription'
                : 'startup.genericDescription',
            )}
          </p>

          {hasConfigurationError && import.meta.env.DEV ? (
            <>
              <code className="mt-4 block rounded-lg bg-[var(--cv-bg-subtle)] px-3 py-2 text-left text-micro text-[var(--cv-t1)]">
                {missingKeys.join('\n')}
              </code>
              <p className="mt-3 text-micro text-[var(--cv-t3)]">
                {t('startup.developerInstruction')}
              </p>
            </>
          ) : null}

          {hasConfigurationError ? (
            <p className="mt-4 text-micro text-[var(--cv-t3)]">
              {t('startup.contactAdministrator')}
            </p>
          ) : (
            <div className="mt-5 flex justify-center">
              <Button
                variant="accent"
                size="sm"
                onClick={() => window.location.reload()}
              >
                {t('common.reload')}
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
