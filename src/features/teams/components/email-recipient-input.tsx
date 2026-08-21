import { useRef, type ClipboardEvent, type KeyboardEvent, type SetStateAction } from 'react'
import { Button } from '../../../shared/components/button'
import { parseEmailRecipients, type EmailRecipientValue } from '../email-recipients'

export function EmailRecipientInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  removeLabel,
  errorId,
  hintId,
  onBlur,
  disabled = false,
  hasError = false,
}: {
  id: string
  label: string
  value: EmailRecipientValue
  onChange: (value: SetStateAction<EmailRecipientValue>) => void
  placeholder: string
  removeLabel: (email: string) => string
  errorId?: string
  hintId?: string
  onBlur?: () => void
  disabled?: boolean
  hasError?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const describedBy = [hasError ? errorId : null, hintId].filter(Boolean).join(' ') || undefined

  const commitDraft = () => {
    onChange((current) => {
      const parsed = parseEmailRecipients(current.draft)
      if (parsed.valid.length === 0 && parsed.invalid.length === 0) return current
      return {
        recipients: [...new Set([...current.recipients, ...parsed.valid])],
        draft: parsed.invalid.join(' '),
      }
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && event.currentTarget.value.length === 0) {
      onChange((current) => current.recipients.length === 0
        ? current
        : {
            recipients: current.recipients.slice(0, -1),
            draft: current.draft,
          })
      return
    }

    if (event.key !== 'Enter' && event.key !== ',' && event.key !== ';') return
    event.preventDefault()
    commitDraft()
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    const parsed = parseEmailRecipients(pasted)
    if (parsed.valid.length === 0 && parsed.invalid.length === 0) return

    event.preventDefault()
    onChange((current) => ({
      recipients: [...new Set([...current.recipients, ...parsed.valid])],
      draft: [current.draft, ...parsed.invalid].filter(Boolean).join(' '),
    }))
  }

  const removeRecipient = (email: string) => {
    onChange((current) => ({
      recipients: current.recipients.filter((recipient) => recipient !== email),
      draft: current.draft,
    }))
    inputRef.current?.focus({ preventScroll: true })
  }

  const updateDraft = (draft: string) => {
    onChange((current) => ({
      recipients: current.recipients,
      draft,
    }))
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-meta font-semibold text-[var(--cv-label-text)]">
        {label}
      </label>
      <div
        className={`flex min-h-control w-full flex-wrap content-start items-center gap-1.5 rounded-lg border
          bg-[var(--cv-input-bg)] p-1.5 transition-colors duration-200 focus-within:border-[var(--cv-t1)] ${
          hasError ? 'border-[var(--cv-primary)]' : 'border-[var(--cv-input-border)]'
        }`}
      >
        {value.recipients.map((email) => (
          <span
            key={email}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--cv-border)]
              bg-[var(--cv-bg-subtle)] py-1 pl-2.5 pr-1 text-meta text-[var(--cv-t2)]"
          >
            <span className="max-w-[16rem] truncate">{email}</span>
            <Button
              variant="ghost"
              size="sm"
              icon="close"
              className="!size-5 !rounded-full !p-0 shrink-0"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => removeRecipient(email)}
              disabled={disabled}
              aria-label={removeLabel(email)}
            />
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="email"
          autoComplete="email"
          value={value.draft}
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            commitDraft()
            onBlur?.()
          }}
          placeholder={value.recipients.length === 0 ? placeholder : ''}
          autoFocus
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          className="min-w-[12rem] flex-1 bg-transparent px-1 py-1 text-ui text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)] focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
    </div>
  )
}
