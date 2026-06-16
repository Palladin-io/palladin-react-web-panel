import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { DialogFooter } from '../../shared/components/dialog-footer'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { ModalShell } from '../../shared/components/modal-shell'
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
 * per-channel toggles (inbox / realtime / push), rendered as a `ModalShell`
 * dialog opened from the Inbox header gear (no standalone route).
 *
 * Mandatory types (agent_pending, grant_pending, grant_revoked) keep inbox +
 * realtime LOCKED on — those toggles render disabled; only push is mutable. The
 * server returns the effective state on every save, so a rejected change snaps
 * back without guesswork.
 *
 * The Push column self-disables when the browser doesn't support web push or
 * the user blocked it; toggling push on triggers the permission prompt.
 */
export function NotificationPreferencesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const preferences = useNotificationPreferences()
  const update = useUpdateNotificationPreferences()
  const webPush = useWebPush()

  const pushUnavailable = !webPush.isSupported || webPush.status === 'denied'

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
    update.mutate([{ type, [channelField(channel)]: next }], {
      onError: () => toast.error(t('notifications.prefs.saveError')),
    })
  }

  return (
    <ModalShell onClose={onClose} ariaLabel={t('notifications.prefs.title')} width={560}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('notifications.prefs.title')}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--cv-t2)]">
            {t('notifications.prefs.subtitle')}
          </p>
        </div>

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
            <div className="grid grid-cols-[1fr_repeat(3,64px)] items-center gap-2 border-b border-[var(--cv-divider)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--cv-t3)]">
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
                className="grid grid-cols-[1fr_repeat(3,64px)] items-center gap-2 border-b border-[var(--cv-divider)] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[var(--cv-t1)]">
                    {t(`notifications.prefs.type.${item.type}`, { defaultValue: item.type })}
                  </p>
                  <p className="truncate text-[11px] text-[var(--cv-t3)]">
                    {t(`notifications.prefs.typeHint.${item.type}`, { defaultValue: '' })}
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
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--cv-t3)]">
            <Icon name="notifications_off" size={13} />
            {t('notifications.pushBlocked')}
          </p>
        )}

        {/* Preferences auto-save on toggle; the footer gives an explicit
            dismissal instead of forcing a backdrop click. */}
        <DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </div>
    </ModalShell>
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

/**
 * On/off switch (track 32×18, thumb 14) matching the prototype's
 * `toggle-track`: ON = primary `#FF4F4F`, OFF = `--cv-t3` at 30% opacity. Locked
 * (mandatory) rows keep the same colours — only `disabled` differs.
 */
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
      className="relative h-[18px] w-[32px] shrink-0 rounded-[9px] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {/* Track — only this dims when OFF, matching the prototype's
          `toggle-track.off` (#8A95A6 @0.3) without fading the white thumb. */}
      <span
        className="absolute inset-0 rounded-[9px] transition-colors"
        style={{ background: checked ? '#FF4F4F' : '#8A95A6', opacity: checked ? undefined : 0.3 }}
      />
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-[left]"
        style={{ left: checked ? '16px' : '2px' }}
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
