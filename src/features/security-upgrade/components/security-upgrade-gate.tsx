import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2, RefreshCw } from 'lucide-react'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { EmergencyKitPanel } from '../../../shared/components/emergency-kit-panel'
import { RecoveryKeyConfirmationForm } from '../../../shared/components/recovery-key-confirmation-form'
import { RecoveryKeyDisplay } from '../../../shared/components/recovery-key-display'
import { WarningZone } from '../../../shared/components/warning-zone'
import { logoutAndReload } from '../../auth/session/client-session'
import { useSecurityUpgradeStore, type PendingSecurityUpgrade } from '../security-upgrade-store'
import { useSecurityUpgradeRun, type UpgradeProgress, type UpgradeStage } from '../use-security-upgrade-run'

/** Dots follow the order the upgrade runs: phrase, confirm, key migration, Emergency Kit. */
const UPGRADE_STEPS = 4

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
        progress={{ current: 0, total: UPGRADE_STEPS }}>
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
        progress={{ current: 1, total: UPGRADE_STEPS }} onBack={() => setStage('phrase')} backLabel={t('common.back')}>
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
        progress={{ current: 3, total: UPGRADE_STEPS }}>
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
      showSteps={pending.kind === 'upgrade'}
      onRetry={() => void run(stage)}
    />
  )
}

interface UpgradeProgressViewProps {
  stage: UpgradeStage
  progress: UpgradeProgress
  failure: 'network' | 'conflict' | null
  running: boolean
  /** A resumed migration has no phrase or kit steps, so it shows no step dots. */
  showSteps: boolean
  onRetry: () => void
}

function UpgradeProgressView({ stage, progress, failure, running, showSteps, onRetry }: UpgradeProgressViewProps) {
  const { t } = useTranslation()
  const accountDone = stage !== 'commit'
  const vaultsDone = stage === 'messageKeys' || stage === 'cleanup' || stage === 'kit'
  const agentsDone = stage === 'cleanup' || stage === 'kit'
  // `progress` counts the active stage only; it is null until that stage knows how many Vaults it touches.
  const activeStageLabel = progress.total === null
    ? t('securityUpgrade.inProgress')
    : t('securityUpgrade.vaultsProgress', { done: progress.done, total: progress.total })

  return (
    <AuthStepShell title={t('securityUpgrade.title')} subtitle={t('securityUpgrade.subtitle')}
      progress={showSteps ? { current: 2, total: UPGRADE_STEPS } : undefined}>
      <div className="flex flex-col gap-3" aria-live="polite">
        <ul className="flex flex-col gap-2 rounded-lg border border-[var(--cv-auth-control-border)]
          bg-[var(--cv-auth-control-bg)] p-3">
          <ProgressRow label={t('securityUpgrade.accountKey')} done={accountDone} active={stage === 'commit'}
            status={accountDone ? t('securityUpgrade.done') : t('securityUpgrade.inProgress')} />
          <ProgressRow label={t('securityUpgrade.vaults')} done={vaultsDone} active={stage === 'rewrap'}
            status={vaultsDone ? t('securityUpgrade.done') : stage === 'rewrap' ? activeStageLabel : t('securityUpgrade.waiting')} />
          <ProgressRow label={t('securityUpgrade.agents')} done={agentsDone} active={stage === 'messageKeys'}
            status={agentsDone ? t('securityUpgrade.done') : stage === 'messageKeys' ? activeStageLabel : t('securityUpgrade.waiting')} />
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
          : active
            ? <Loader2 size={14} className="animate-spin text-[var(--cv-auth-muted)]" />
            : <Circle size={14} className="text-[var(--cv-auth-muted)]" />}
        {label}
      </span>
      <span className="text-meta text-[var(--cv-auth-muted)]">{status}</span>
    </li>
  )
}
