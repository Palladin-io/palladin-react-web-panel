import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import type { Extension } from '@codemirror/state'
import type { ScriptInterpreter } from '../types'

export interface ScriptEditorProps {
  value: string
  onChange: (next: string) => void
  interpreter: ScriptInterpreter
  disabled?: boolean
  placeholder?: string
  /** Fixed editor height; the editor scrolls internally past it. */
  height?: string
}

/**
 * CodeMirror 6 editor for SCRIPT entries. Syntax highlighting follows the
 * interpreter picker (bash/sh → shell, node → JS, python → Python). The chrome
 * (background, text, gutter, cursor, selection) is driven entirely by `--cv-*`
 * tokens so it adapts to light/dark with the app; a fixed height keeps the modal
 * compact while the editor scrolls its own overflow.
 */
export function ScriptEditor({
  value,
  onChange,
  interpreter,
  disabled,
  placeholder,
  height = '11.875rem',
}: ScriptEditorProps) {
  const { t } = useTranslation()
  const extensions = useMemo<Extension[]>(
    () => [languageFor(interpreter), CV_THEME, syntaxHighlighting(CV_HIGHLIGHT)],
    [interpreter],
  )
  const lineCount = value.length === 0 ? 1 : value.split('\n').length

  return (
    <div className="overflow-hidden rounded-[0.625rem] border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]">
      {/* `min-w-0` lets the editor shrink inside the modal so a long line scrolls
          the editor internally instead of pushing the whole dialog wider. */}
      <div className="min-w-0">
        <CodeMirror
          value={value}
          onChange={onChange}
          height={height}
          editable={!disabled}
          readOnly={disabled}
          placeholder={placeholder}
          theme={CV_THEME}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            autocompletion: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
          }}
        />
      </div>
      <div className="flex items-center gap-1.5 border-t border-[var(--cv-divider)] px-2.5 py-1 text-meta text-[var(--cv-t3)]">
        <span style={{ color: 'var(--cv-script)' }} aria-hidden>●</span>
        <span>{interpreter}</span>
        <span>·</span>
        <span>{t('vault.entries.script.lineCount', { count: lineCount })}</span>
      </div>
    </div>
  )
}

function languageFor(interpreter: ScriptInterpreter): Extension {
  if (interpreter === 'node') return javascript()
  if (interpreter === 'python') return python()
  return StreamLanguage.define(shell)
}

/**
 * Editor chrome bound to the app's design tokens. The border/radius live on the
 * outer wrapper (so the footer joins seamlessly); gutters, cursor, active line,
 * and selection all resolve through `--cv-*`, keeping the editor on-palette in
 * both themes with zero hard-coded chrome colours. `maxWidth`/scroller overflow
 * keep a long line inside the editor rather than widening the modal.
 */
const CV_THEME: Extension = EditorView.theme({
  '&': {
    fontSize: 'var(--text-ui)',
    maxWidth: '100%',
    backgroundColor: 'transparent',
    color: 'var(--cv-input-text)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.6',
    overflowX: 'auto',
  },
  '.cm-content': { caretColor: 'var(--cv-t1)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cv-t1)' },
  '.cm-gutters': {
    backgroundColor: 'var(--cv-empty-bg)',
    color: 'var(--cv-t3)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'rgb(var(--cv-primary-rgb) / 0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--cv-t2)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgb(var(--cv-primary-rgb) / 0.18)',
  },
  '.cm-placeholder': { color: 'var(--cv-input-placeholder)' },
})

/**
 * Restrained syntax palette bound to design tokens: script violet for keywords,
 * success green for strings, info blue for numbers, muted `--cv-t3` for comments.
 */
const CV_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--cv-t3)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: 'var(--cv-script)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--cv-success)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--cv-info)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--cv-input-text)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--cv-t2)' },
])
