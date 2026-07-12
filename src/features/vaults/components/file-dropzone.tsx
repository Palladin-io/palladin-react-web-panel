import { useRef, useState } from 'react'
import { Icon } from '../../../shared/components/icon'

export interface FileDropzoneProps {
  /** Called with the chosen file (drag-drop or click-to-browse). */
  onFile: (file: File) => void
  /** `accept` attribute for the hidden input (e.g. `.csv,.json,.xml`). */
  accept?: string
  disabled?: boolean
  /** Primary prompt, e.g. "Drop a file or click to browse". */
  label: string
  /** Secondary hint below the prompt (supported formats / size note). */
  hint?: string
}

/**
 * Drag-and-drop file picker with a click-to-browse fallback. Renders a dashed
 * drop target that highlights while a file is dragged over it; the underlying
 * `<input type=file>` stays visually hidden and is triggered on click. Only the
 * first file is used.
 */
export function FileDropzone({
  onFile,
  accept,
  disabled = false,
  label,
  hint,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed
        px-6 py-10 text-center transition-colors ${
          disabled
            ? 'cursor-not-allowed opacity-40 border-[var(--cv-input-border)]'
            : 'cursor-pointer ' +
              (dragging
                ? 'border-[var(--cv-primary)] bg-[rgb(var(--cv-primary-rgb)/0.06)]'
                : 'border-[var(--cv-input-border)] hover:border-[var(--cv-t1)]')
        }`}
    >
      <Icon name="upload_file" size={28} className="text-[var(--cv-t3)]" />
      <span className="text-ui font-medium text-[var(--cv-t1)]">{label}</span>
      {hint ? <span className="text-meta text-[var(--cv-t3)]">{hint}</span> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
