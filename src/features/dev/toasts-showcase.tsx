import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { Icon } from '../../shared/components/icon'
import { useThemeStore } from '../../shared/stores/theme-store'
import { showNotificationToast } from '../notifications/notification-toast'
import type { NotificationPayload } from '../notifications/notification-types'

/**
 * Dev-only showcase for every toast the app can raise — base Sonner variants
 * and the rich notification toasts (with their bold-name bodies, divider and
 * "Open" action). Fires them with `Infinity` duration so they stack and stay
 * put while you tune the style; toggle light/dark to compare both themes.
 *
 * Route: `/dev-toasts`. Not linked in the nav — navigate to it directly.
 */
const KEEP = Number.POSITIVE_INFINITY
const noop = () => {}

const A = 'Deploy Bot'
const E = 'AWS Root Key'
const V = 'Production'
const BY = 'Patryk'

const mk = (type: string, body: string, data: Record<string, string>): NotificationPayload => ({
  type,
  title: body,
  body,
  data,
  timestamp: undefined,
})

const NOTIFICATIONS: { label: string; payload: NotificationPayload }[] = [
  { label: 'grant_pending', payload: mk('grant_pending', `${A} requested access`, { agentName: A, entryLabel: E, vaultName: V }) },
  { label: 'grant_approved · granular', payload: mk('grant_approved', 'Access approved', { agentName: A, entryLabel: E, vaultName: V, actorName: BY }) },
  { label: 'grant_approved · full', payload: mk('grant_approved', 'Vault access approved', { agentName: A, vaultName: V, grantType: 'full', actorName: BY }) },
  { label: 'grant_denied', payload: mk('grant_denied', 'Access denied', { agentName: A, entryLabel: E, vaultName: V }) },
  { label: 'grant_revoked', payload: mk('grant_revoked', 'Access revoked', { agentName: A, entryLabel: E, vaultName: V }) },
  { label: 'agent_pending', payload: mk('agent_pending', `${A} is awaiting approval`, { agentName: A }) },
  { label: 'credential_accessed', payload: mk('credential_accessed', 'Credential accessed', { agentName: A, entryLabel: E, vaultName: V }) },
  { label: 'credential_stale', payload: mk('credential_stale', 'Credential reported stale', { agentName: A, entryLabel: E, vaultName: V }) },
]

const BASE: { label: string; fire: () => void }[] = [
  { label: 'success', fire: () => toast.success('Agent deactivated', { duration: KEEP }) },
  { label: 'error', fire: () => toast.error('Could not deactivate the agent', { duration: KEEP }) },
  { label: 'info', fire: () => toast.info('Heads up — something happened', { duration: KEEP }) },
  { label: 'warning', fire: () => toast.warning('This option keeps the secret in context', { duration: KEEP }) },
  { label: 'plain', fire: () => toast('Plain message', { duration: KEEP }) },
  {
    label: 'success + action',
    fire: () =>
      toast.success('Vault created', {
        description: (
          <span className="cv-toast-wrap">
            <button type="button" className="cv-toast-open" onClick={noop} aria-label="Open">
              <Icon name="open_in_new" size={15} />
            </button>
            <span className="cv-toast-body block">Production vault is ready.</span>
          </span>
        ),
        duration: KEEP,
      }),
  },
]

export function ToastsShowcase() {
  const { theme, toggleTheme } = useThemeStore()

  const fireAllNotifications = () => NOTIFICATIONS.forEach((n) => showNotificationToast(n.payload, noop, KEEP))
  const fireAll = () => {
    BASE.forEach((b) => b.fire())
    fireAllNotifications()
  }

  return (
    <div className="min-h-screen bg-[var(--cv-modal-bg)] px-4 py-4 text-[var(--cv-t1)]">
      {/* All controls on the LEFT — the top-right is where toasts pop, so
          keeping buttons here means they never get covered. */}
      <div className="mb-5">
        <h2 className="text-heading font-bold">Toast showcase</h2>
        <p className="text-meta text-[var(--cv-t3)]">
          Theme: <span className="font-semibold text-[var(--cv-t1)]">{theme}</span> · toasts stay open (Infinity) for styling
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon="dark_mode" onClick={toggleTheme}>
            Toggle {theme === 'dark' ? 'light' : 'dark'}
          </Button>
          <Button variant="accent" size="sm" onClick={fireAll}>
            Show all
          </Button>
          <Button variant="subtle" size="sm" onClick={() => toast.dismiss()}>
            Dismiss all
          </Button>
        </div>
      </div>

      <Section title="Base variants (Sonner)">
        {BASE.map((b) => (
          <Button key={b.label} variant="subtle" size="sm" onClick={b.fire}>
            {b.label}
          </Button>
        ))}
      </Section>

      <Section title="Notification toasts (title · divider · bold-name body · Open action)">
        <Button variant="outline" size="sm" onClick={fireAllNotifications}>
          all notifications
        </Button>
        {NOTIFICATIONS.map((n) => (
          <Button key={n.label} variant="subtle" size="sm" onClick={() => showNotificationToast(n.payload, noop, KEEP)}>
            {n.label}
          </Button>
        ))}
      </Section>

      <p className="mt-6 max-w-[40rem] text-meta leading-relaxed text-[var(--cv-t3)]">
        Note: <code>agent_approved</code>, <code>agent_deactivated</code> and <code>agent_resolved</code> intentionally
        raise <strong>no</strong> toast (the actor already sees a success toast / they’re collapse markers), so they’re
        not listed here. Toast look &amp; feel: the <code>&lt;Toaster&gt;</code> in <code>src/app/providers.tsx</code>{' '}
        (class <code>cv-toast</code>) + the <code>.cv-toast</code> rules in <code>src/index.css</code> — themed
        surface with the variant colour as a left-border + icon accent.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-meta font-semibold uppercase tracking-[0.06em] text-[var(--cv-t3)]">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}
