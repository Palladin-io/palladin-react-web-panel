import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { EmergencyKitPanel } from '../../../shared/components/emergency-kit-panel'
import { RecoveryKeyConfirmationForm } from '../../../shared/components/recovery-key-confirmation-form'
import { RecoveryKeyDisplay } from '../../../shared/components/recovery-key-display'
import { WarningZone } from '../../../shared/components/warning-zone'
import { logoutAndReload } from '../../auth/session/client-session'
import { useSecurityUpgradeStore, type PendingSecurityUpgrade } from '../security-upgrade-store'
import { useSecurityUpgradeRun, type UpgradeProgress, type UpgradeStage } from '../use-security-upgrade-run'

export interface SecurityUpgradeGateProps {
  children: ReactNode
}

/** Blocks the unlocked app until a pending security upgrade or its resume has finished. */
export function SecurityUpgradeGate({ children }: SecurityUpgradeGateProps) {
  const pending = useSecurityUpgradeStore((state) => state.pending)
  if (!pending) return <>{children}</>
  return <SecurityUpgradeFlow key={pending.kind} pending={pending} />
}

function SecurityUpgradeFlow({ pending }: { pending: PendingSecurityUpgrade }) {
  const { t } = useTranslation()
  const { stage, setStage, progress, failure, running, kit, run, finish } = useSecurityUpgradeRun(pending)

  useEffect(() => {
    if (pending.kind === 'resume') void run('rewrap')
  }, [pending.kind, run])

  if (pending.kind === 'upgrade' && stage === 'phrase') {
    return (
      <AuthStepShell title={t('securityUpgrade.phraseTitle')} subtitle={t('securityUpgrade.phraseSubtitle')}
        progress={{ current: 0, total: 3 }}>
        <RecoveryKeyDisplay
          mnemonic={pending.recoveryMnemonic}
          continueLabel={t('onboarding.savedRecoveryKey')}
          onContinue={() => setStage('confirm')}
        />
      </AuthStepShell>
    )
  }

  if (pending.kind === 'upgrade' && stage === 'confirm') {
    return (
      <AuthStepShell title={t('onboarding.confirmTitle')} subtitle={t('onboarding.confirmSubtitle')}
        progress={{ current: 1, total: 3 }} onBack={() => setStage('phrase')} backLabel={t('common.back')}>
        <RecoveryKeyConfirmationForm
          mnemonic={pending.recoveryMnemonic}
          isSubmitting={running}
          error={null}
          onConfirmed={() => void run('commit')}
        />
      </AuthStepShell>
    )
  }

  if (stage === 'kit' && kit) {
    return (
      <AuthStepShell title={t('emergencyKit.title')} subtitle={t('securityUpgrade.kitSubtitle')}
        progress={{ current: 2, total: 3 }}>
        <EmergencyKitPanel kit={kit} continueLabel={t('emergencyKit.continue')} onContinue={finish} />
      </AuthStepShell>
    )
  }

  return (
    <UpgradeProgressView
      stage={stage}
      progress={progress}
      failure={failure}
      running={running}
      onRetry={() => void run(stage)}
    />
  )
}

interface UpgradeProgressViewProps {
  stage: UpgradeStage
  progress: UpgradeProgress
  failure: 'network' | 'conflict' | null
  running: boolean
  onRetry: () => void
}

function UpgradeProgressView({ stage, progress, failure, running, onRetry }: UpgradeProgressViewProps) {
  const { t } = useTranslation()
  const accountDone = stage !== 'commit'
  const vaultsDone = stage === 'cleanup' || stage === 'kit'
  const vaultsLabel = progress.total === null
    ? t('securityUpgrade.waiting')
    : t('securityUpgrade.vaultsProgress', { done: progress.done, total: progress.total })

  return (
    <AuthStepShell title={t('securityUpgrade.title')} subtitle={t('securityUpgrade.subtitle')} align="center">
      <div className="flex flex-col gap-3" aria-live="polite">
        <ul className="flex flex-col gap-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
          <ProgressRow label={t('securityUpgrade.accountKey')} done={accountDone} active={stage === 'commit'}
            status={accountDone ? t('securityUpgrade.done') : t('securityUpgrade.inProgress')} />
          <ProgressRow label={t('securityUpgrade.vaults')} done={vaultsDone} active={stage === 'rewrap'}
            status={vaultsDone ? t('securityUpgrade.done') : vaultsLabel} />
        </ul>
        <p className="text-meta text-[var(--cv-auth-muted)]">{t('securityUpgrade.entriesUnchanged')}</p>

        {failure === 'network' && (
          <>
            <WarningZone title={t('securityUpgrade.stoppedTitle')}>{t('securityUpgrade.stoppedBody')}</WarningZone>
            <AuthSubmitButton type="button" onClick={onRetry} disabled={running}>
              <RefreshCw size={14} />
              {t('securityUpgrade.retry')}
            </AuthSubmitButton>
          </>
        )}
        {failure === 'conflict' && (
          <>
            <WarningZone title={t('securityUpgrade.conflictTitle')}>{t('securityUpgrade.conflictBody')}</WarningZone>
            <AuthSubmitButton type="button" onClick={() => void logoutAndReload('/login')}>
              {t('common.logout')}
            </AuthSubmitButton>
          </>
        )}
      </div>
    </AuthStepShell>
  )
}

function ProgressRow({ label, status, done, active }: { label: string; status: string; done: boolean; active: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 text-ui">
      <span className="flex items-center gap-2 text-[var(--cv-t1)]">
        {done
          ? <Check size={14} className="text-[var(--cv-success)]" />
          : <Loader2 size={14} className={active ? 'animate-spin text-[var(--cv-t3)]' : 'text-[var(--cv-t3)]'} />}
        {label}
      </span>
      <span className="text-meta text-[var(--cv-t3)]">{status}</span>
    </li>
  )
}
