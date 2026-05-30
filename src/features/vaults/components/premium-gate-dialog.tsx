import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'
import { ModalShell } from '../../../shared/components/modal-shell'

export interface PremiumGateDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Soft gate shown when a free-plan user hits a Pro-only ceiling
 * (currently: trying to create a second vault). The "+ Create Vault"
 * button is always visible — gating happens here, on click, instead of
 * being baked into the button itself. That way the affordance stays
 * discoverable and we get a teachable moment for the upsell.
 *
 * Keep this component dumb: it owns no business logic and does not
 * decide *whether* the user is gated — the caller passes `open` based
 * on its own permission check.
 */
export function PremiumGateDialog({ open, onClose }: PremiumGateDialogProps) {
  const { t } = useTranslation()

  // Mount-only: track that the upsell surfaced. We can't track this
  // higher up because the dialog is the upsell — opening *is* the event.
  useEffect(() => {
    if (!open) return
    analytics.capture('billing', 'upgrade-prompt-shown', {
      reason: 'vault-limit-reached',
    })
  }, [open])

  if (!open) return null

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={t('vault.premiumGate.title')}
      width={400}
    >
      <div className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--cv-premium) 15%, transparent)',
                color: 'var(--cv-premium)',
              }}
            >
              <Icon name="workspace_premium" size={20} color="var(--cv-premium)" />
            </span>
            <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
              {t('vault.premiumGate.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <p className="text-[13px] leading-relaxed text-[var(--cv-t2)]">
          {t('vault.premiumGate.description')}
        </p>

        <ul className="flex flex-col gap-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-bg-subtle)] p-3">
          <PremiumPerk label={t('vault.premiumGate.perkUnlimitedVaults')} />
          <PremiumPerk label={t('vault.premiumGate.perkFullMode')} />
          <PremiumPerk label={t('vault.premiumGate.perkPriority')} />
        </ul>

        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
            {t('vault.premiumGate.maybeLater')}
          </Button>
          <Link
            to="/billing"
            onClick={() => {
              analytics.capture('billing', 'upgrade-prompt-clicked', {
                reason: 'vault-limit-reached',
              })
              onClose()
            }}
            className="btn-premium inline-flex flex-[2] items-center justify-center gap-2
              rounded-lg border bg-transparent px-3.5 py-2 text-[13px] font-bold no-underline
              transition-colors"
          >
            <Icon name="workspace_premium" size={16} />
            {t('vault.premiumGate.upgradeCta')}
          </Link>
        </DialogFooter>
      </div>
    </ModalShell>
  )
}

function PremiumPerk({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-[12px] text-[var(--cv-t2)]">
      <Icon
        name="check_circle"
        size={14}
        color="var(--cv-premium)"
      />
      <span>{label}</span>
    </li>
  )
}
