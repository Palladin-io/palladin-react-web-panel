import { useId, useState, type ReactNode } from 'react'
import { Icon } from './icon'
import { FeedbackSlot } from './form-field'

export function FormSection({ label, summary, error, children }: {
  label: string
  summary: string
  error?: string
  children: ReactNode
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return <section className="border-b border-[var(--cv-divider)] last:border-b-0">
    <button type="button" aria-label={`${label}: ${summary}`} aria-expanded={open} aria-controls={id}
      aria-describedby={!open && error ? `${id}-error` : undefined} onClick={() => setOpen(!open)}
      className="flex min-h-control w-full items-center gap-3 py-3 text-meta text-[var(--cv-t1)] focus-visible:outline-2 focus-visible:outline-[var(--cv-primary)]">
      <span className="shrink-0 font-medium">{label}</span>
      <span className="min-w-0 flex-1 break-words text-right text-[var(--cv-t2)]">{summary}</span>
      <Icon name="expand_more" size={16}
        className={`shrink-0 text-[var(--cv-t3)] transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </button>
    <div id={`${id}-error`}><FeedbackSlot visible={!open && !!error} color="red">{error}</FeedbackSlot></div>
    <div id={id} inert={!open} aria-hidden={!open}
      className="grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden', transitionDelay: open ? '0s' : '0s, 0s, 200ms' }}>
      <div className="min-h-0 overflow-hidden">
        <div className="flex flex-col gap-3 pb-4">{children}</div>
      </div>
    </div>
  </section>
}
