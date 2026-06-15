import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { useWebPush } from './use-web-push'
import {
  PREFERENCE_CHANNELS,
  type PreferenceChannel,
  type PreferenceItem,
} from './preferences-api'
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from './notification-queries'

/**
 * Notification preferences (CVT-164) — LinkedIn-style matrix of per-type ×
 * per-channel toggles (inbox / realtime / push).
 *
 * Mandatory types (agent_pending, grant_pending, grant_revoked) keep inbox +
 * realtime LOCKED on — those columns render disabled with a lock affordance;
 * only push is mutable. The server returns the effective state on every save,
 * so a rejected change snaps back without guesswork.
 *
 * The Push column self-disables when the browser doesn't support web push or
 * the user blocked it; toggling push on triggers the permission prompt.
 */
export function NotificationPreferencesPage() {
  const { t } = useTranslation()
  const preferences = useNotificationPreferences()
  const update = useUpdateNotificationPreferences()
  const webPush = useWebPush()

  const pushUnavailable =
    !webPush.isSupported || webPush.status === 'denied'

  function toggle(item: PreferenceItem, channel: PreferenceChannel, next: boolean) {
    // Mandatory inbox/realtime are locked — the server ignores them anyway, but
    // we don't even fire the request.
    if (item.mandatory && channel !== 'push') return

    if (channel === 'push' && next && webPush.status !== 'registered') {
      // Enabling push needs OS permission first; only persist once registered.
      void webPush.requestPermissionAndRegister().then((status) => {
        if (status === 'registered') persist(item.type, channel, true)
      })
      return
    }
    persist(item.type, channel, next)
  }

  function persist(type: string, channel: PreferenceChannel, next: boolean) {
    update.mutate(
      [{ type, [channelField(channel)]: next }],
      {
        onError: () => toast.error(t('notifications.prefs.saveError')),
      },
    )
  }

  return (
    <div className="mx-auto min-h-full max-w-[760px] px-7 py-6 text-[var(--cv-t1)]">
      <header className="mb-5">
        <h1 className="text-[20px] font-bold">{t('notifications.prefs.title')}</h1>
        <p className="mt-0.5 text-[12px] text-[var(--cv-t3)]">
          {t('notifications.prefs.subtitle')}
        </p>
      </header>

      {preferences.isPending ? (
        <PrefsSkeleton />
      ) : preferences.isError ? (
        <ErrorState
          message={t('notifications.prefs.errorLoad')}
          onRetry={preferences.refetch}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_repeat(3,72px)] items-center gap-2 border-b border-[var(--cv-divider)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--cv-t3)]">
            <span>{t('notifications.prefs.colType')}</span>
            {PREFERENCE_CHANNELS.map((channel) => (
              <span key={channel} className="text-center">
                {t(`notifications.prefs.col.${channel}`)}
              </span>
            ))}
          </div>

          {(preferences.data ?? []).map((item) => (
            <div
              key={item.type}
              className="grid grid-cols-[1fr_repeat(3,72px)] items-center gap-2 border-b border-[var(--cv-divider)] px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--cv-t1)]">
                  {t(`notifications.prefs.type.${item.type}`, {
                    defaultValue: item.type,
                  })}
                </p>
                <p className="truncate text-[11px] text-[var(--cv-t3)]">
                  {t(`notifications.prefs.typeHint.${item.type}`, {
                    defaultValue: '',
                  })}
                </p>
              </div>
              {PREFERENCE_CHANNELS.map((channel) => (
                <div key={channel} className="flex justify-center">
                  <ChannelToggle
                    item={item}
                    channel={channel}
                    pushUnavailable={pushUnavailable}
                    disabled={update.isPending}
                    onToggle={(next) => toggle(item, channel, next)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {pushUnavailable && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--cv-t3)]">
          <Icon name="notifications_off" size={13} />
          {t('notifications.pushBlocked')}
        </p>
      )}
    </div>
  )
}

function channelField(
  channel: PreferenceChannel,
): 'inboxEnabled' | 'signalREnabled' | 'pushEnabled' {
  if (channel === 'inbox') return 'inboxEnabled'
  if (channel === 'realtime') return 'signalREnabled'
  return 'pushEnabled'
}

function channelValue(item: PreferenceItem, channel: PreferenceChannel): boolean {
  if (channel === 'inbox') return item.inboxEnabled
  if (channel === 'realtime') return item.signalREnabled
  return item.pushEnabled
}

function ChannelToggle({
  item,
  channel,
  pushUnavailable,
  disabled,
  onToggle,
}: {
  item: PreferenceItem
  channel: PreferenceChannel
  pushUnavailable: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const checked = channelValue(item, channel)
  const locked = item.mandatory && channel !== 'push'
  const unavailable = channel === 'push' && pushUnavailable
  const isDisabled = disabled || locked || unavailable

  const label = t(`notifications.prefs.col.${channel}`)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${t(`notifications.prefs.type.${item.type}`, { defaultValue: item.type })} — ${label}`}
      disabled={isDisabled}
      onClick={() => onToggle(!checked)}
      title={locked ? t('notifications.prefs.locked') : undefined}
      className="relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: checked ? '#2EC4B6' : 'var(--cv-btn-subtle-bg)',
      }}
    >
      <span
        className="inline-block h-[16px] w-[16px] rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(19px)' : 'translateX(3px)' }}
      />
    </button>
  )
}

function PrefsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index} className="h-[52px] animate-pulse rounded-xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}
