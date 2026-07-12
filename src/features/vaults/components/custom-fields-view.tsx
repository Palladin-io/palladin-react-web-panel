import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CopyButton } from '../../../shared/components/copy-button'
import { Icon } from '../../../shared/components/icon'
import { Tooltip } from '../../../shared/components/tooltip'
import { copySecretToClipboard } from '../../../shared/lib/clipboard'
import { type CustomField, isTotpField } from '../types'
import { TotpDisplay } from './totp-display'

export interface CustomFieldsViewProps {
  fields: CustomField[]
}

/**
 * Read-only display of custom fields on the entry-detail Details tab, following
 * the Locked Value Pattern: `concealed` values start masked with a reveal
 * toggle, `totp` renders a live code, plain `text` shows inline. Every field is
 * copyable. Unknown field types are skipped (forward-compat) rather than
 * throwing. The whole block is `ph-no-capture` — labels and values are
 * encrypted-at-rest and treated as secret in analytics.
 */
export function CustomFieldsView({ fields }: CustomFieldsViewProps) {
  const { t } = useTranslation()
  const renderable = fields.filter(
    (f) => isTotpField(f) || (typeof f.value === 'string' && (f.type === 'text' || f.type === 'concealed')),
  )
  if (renderable.length === 0) return null

  return (
    <section className="ph-no-capture flex flex-col gap-1.5">
      <h3 className="text-meta font-semibold text-[var(--cv-label-text)]">
        {t('vault.entries.customFields.title')}
      </h3>
      <div className="flex flex-col divide-y divide-[var(--cv-divider)] rounded-lg border border-[var(--cv-input-border)]">
        {renderable.map((field) => (
          <FieldViewRow key={field.id} field={field} />
        ))}
      </div>
    </section>
  )
}

function FieldViewRow({ field }: { field: CustomField }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Tooltip content={field.label} className="w-32 shrink-0 truncate text-meta text-[var(--cv-t3)]">
        {field.label}
      </Tooltip>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {isTotpField(field) ? (
          <TotpDisplay params={field.value} compact />
        ) : field.type === 'concealed' ? (
          <>
            <span className="min-w-0 flex-1 truncate text-right font-mono text-ui tracking-wide text-[var(--cv-t1)]">
              {shown ? String(field.value) : maskValue(String(field.value).length)}
            </span>
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
              title={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded
                text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
            >
              <Icon name={shown ? 'visibility_off' : 'visibility'} size={15} />
            </button>
            <SecretCopyButton value={String(field.value)} />
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-right text-ui text-[var(--cv-t1)]">
              {String(field.value)}
            </span>
            <CopyButton value={String(field.value)} label={t('common.copy')} />
          </>
        )}
      </div>
    </div>
  )
}

/** Copy a concealed value through the auto-clearing clipboard path. */
function SecretCopyButton({ value }: { value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copySecretToClipboard(value)
        if (!ok) {
          toast.error(t('vault.entries.copyFailed'))
          return
        }
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }}
      aria-label={copied ? t('common.copied') : t('common.copy')}
      title={copied ? t('common.copied') : t('common.copy')}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded
        text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={15} />
    </button>
  )
}

function maskValue(length: number): string {
  return '•'.repeat(Math.min(Math.max(length, 8), 18))
}
