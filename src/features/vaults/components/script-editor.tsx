import { useMemo } from 'react'
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
  height = '300px',
}: ScriptEditorProps) {
  const extensions = useMemo<Extension[]>(
    () => [languageFor(interpreter), CV_THEME, syntaxHighlighting(CV_HIGHLIGHT)],
    [interpreter],
  )

  return (
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
  )
}

function languageFor(interpreter: ScriptInterpreter): Extension {
  if (interpreter === 'node') return javascript()
  if (interpreter === 'python') return python()
  return StreamLanguage.define(shell)
}

/**
 * Editor chrome bound to the app's design tokens. `&` is the CodeMirror root, so
 * background/border/radius live there; gutters, cursor, active line, and
 * selection all resolve through `--cv-*`, keeping the editor on-palette in both
 * themes with zero hard-coded chrome colours.
 */
const CV_THEME: Extension = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: 'var(--cv-input-bg)',
    color: 'var(--cv-input-text)',
    borderRadius: '8px',
    border: '1px solid var(--cv-input-border)',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--cv-t1)' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { caretColor: 'var(--cv-t1)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cv-t1)' },
  '.cm-gutters': {
    backgroundColor: 'var(--cv-empty-bg)',
    color: 'var(--cv-t3)',
    border: 'none',
    borderTopLeftRadius: '8px',
    borderBottomLeftRadius: '8px',
  },
  '.cm-activeLine': { backgroundColor: 'rgb(var(--cv-primary-rgb) / 0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--cv-t2)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgb(var(--cv-primary-rgb) / 0.18)',
  },
  '.cm-placeholder': { color: 'var(--cv-input-placeholder)' },
})

/**
 * Restrained syntax palette reusing the app's established accent hexes (the same
 * literals as the entry-type presentation): script violet for keywords, success
 * green for strings, credential blue for numbers, muted `--cv-t3` for comments.
 */
const CV_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--cv-t3)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: '#A78BFA' },
  { tag: [tags.string, tags.special(tags.string)], color: '#10B981' },
  { tag: [tags.number, tags.bool, tags.null], color: '#60A5FA' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--cv-input-text)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--cv-t2)' },
])
