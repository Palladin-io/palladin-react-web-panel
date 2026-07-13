# Component Catalog

Every genuinely shared/reusable control in the web panel. Paths are relative to `src/`. Import shared components from `shared/components/` and shared helpers from `shared/lib/`.

## Shared components (`shared/components/`)

| Component | File | Purpose | Key props / variants |
|-----------|------|---------|----------------------|
| `Button` | `shared/components/button.tsx` | Primary interactive button | `variant` (accent / subtle / outline / ghost / danger / positive / premium), `size` (sm / md — **always sm**; sm = `h-action`, 36px high / `text-action`, 14px text), `icon` (Material Symbols glyph). Exports `PREMIUM_BUTTON_SM_CLASS`, `POSITIVE_BUTTON_SM_CLASS` for `<Link>`. |
| `FormInput` | `shared/components/form-field.tsx` | Labelled text input | `label`, `labelSuffix?` (muted adornment, e.g. "· visible to agents"), `labelClassName?` (e.g. `sr-only`), `id`, `borderClass`, `monospace`, `error`, `copyable?`, `trailingAction?` (`{icon,onClick,label,show?}` — e.g. open-URL) + passthrough `InputHTMLAttributes`. |
| `FieldFeedback` | `shared/components/form-field.tsx` | Fixed-height (`h-feedback`, 20px rendered) field-level error/success row, no layout shift | `visible`, `color` (red / teal), `children`. |
| `FeedbackSlot` | `shared/components/form-field.tsx` | Animated-height wrapper that slides content in below a field | `visible`, `color`, `children` (grid `0fr→1fr` reveal). |
| `SecretInput` | `shared/components/secret-input.tsx` | Password field masked via `.secret-mask` font (never `type=password`) with show/hide toggle | `id`, `label`, `value`, `onChange`, `shown`, `onToggleShown`, `placeholder`, `disabled`, `monospace`, `error`, `onBlur`. |
| `FormTextarea` | `shared/components/form-textarea.tsx` | Labelled textarea matching `FormInput` tokens | `label`, `id`, `labelClassName`, `borderClass`, `hasError`, `monospace`. |
| `FormSelect` | `shared/components/form-select.tsx` | Native `<select>` styled like `FormInput` with a chevron affordance | `id`, `label?`, `labelClassName?`, `children` (`<option>`s) + passthrough `SelectHTMLAttributes`. |
| `SearchBar` | `shared/components/search-bar.tsx` | Canonical list/global search field; fixed `h-control`, `text-ui`, card-surface background | `value`, `onChange`, `placeholder?`, `className?`, `inputRef?`, `name?`, `autoFocus?`, `trailing?`. |
| `EncryptionNotice` | `shared/components/encryption-notice.tsx` | Success-tinted "encrypted on your device" callout (`--cv-success`) | `children` (caller's translated copy). Used by create-entry + import wizard. |
| `FileDropzone` | `vaults/components/file-dropzone.tsx` | Drag-and-drop + click-to-browse file picker (dashed target, first file only) | `onFile`, `accept?`, `disabled?`, `label`, `hint?`. (Feature-local; promote to `shared/` if a 2nd consumer appears.) |
| `EntryIcon` | `vaults/components/entry-icon.tsx` | Circular entry avatar — renders a favicon/blob URL as `<img>`, falls back to the type glyph on load error | `icon`, `type`, `color?`, `className?`. Exported via the vaults barrel; used by entries list + dashboard recents. |
| `PopoverMenu` | `vaults/components/popover-menu.tsx` | Action menu (icon + label + right-hint, separators, danger items) portaled to `document.body` — safe inside overflow-clipped dialogs | `trigger`, `items` (`MenuItemSpec \| 'separator'`), `ariaLabel?`, `triggerClassName?`, `alignLeft?`, `openUp?`. Used by the entry-form field rows, type menus, and the 2FA card. Promote to `shared/` on a 3rd consumer. |
| `SectionHeader` | `vaults/components/section-header.tsx` | Small muted label + thin rule — the `[name ── line]` form-section divider | `children`. |
| `EntryIconButton` | `vaults/components/entry-icon-button.tsx` | Inline entry-icon button that opens the icon/colour picker in a portaled popover (used next to the Label input) | `icon`, `color`, `type`, `onChange`, `onColorChange`, `onFileSelected`, `disabled?`. |
| `ScriptExecHint` | `vaults/components/script-exec-hint.tsx` | Calm `--cv-script` "runs on the agent via exec" annotation under the script editor (not a WarningZone) | none. |
| `DialogFooter` | `shared/components/dialog-footer.tsx` | Modal footer strip: edge-bleed negative margin, top border, tinted bg | `children` (buttons use `flex-1` / `flex-[2]`). |
| `ModalShell` | `shared/components/modal-shell.tsx` | Modal scaffold: backdrop, Escape dismiss, body scroll lock, and (with `title`) the canonical header+divider / scroll body / divided footer chrome | `onClose?`, `ariaLabel`, `title?` (ReactNode → renders header + close + divider + scroll body), `footer?` (DialogFooter), `width` (default 480; 560 for forms), `children`. See `docs/architecture/dialogs.md`. |
| `Icon` | `shared/components/icon.tsx` | Material Symbols Rounded glyph wrapper | `name`, `size` (default 18), `color`, `className`, `ariaHidden`, `style`. |
| `Tooltip` | `shared/components/tooltip.tsx` | 150ms-delay tooltip portaled to body; shows only when text is truncated | `content`, `children`, `className`, `delayMs`. |
| `WarningZone` | `shared/components/warning-zone.tsx` | Amber callout for security/irreversible actions | `title` (uppercase heading), `children`. |
| `ErrorState` | `shared/components/error-state.tsx` | Red-tinted error card with Retry button | `message?`, `onRetry`. |
| `EmptyState` | `shared/components/empty-state.tsx` | Canonical dashed empty-list state with optional guidance and action | `title`, `description?`, `action?`, `icon?`, `className?`. |
| `SkeletonBlock` | `shared/components/skeleton-block.tsx` | Theme-aware loading placeholder | `height?`, `rounded?` (`xl` / `2xl`), `className?`. |
| `TypeFilterDropdown` | `shared/components/type-filter-dropdown.tsx` | Multi-select filter dropdown (checkbox listbox + Clear row) | `options`, `selected` (Set\<string\>), `onChange`, `placeholder`, `ariaLabel?`, `triggerClassName?`, `optionPrefix?`. |
| `DateTimePicker` | `shared/components/datetime-picker.tsx` | Anchored calendar popover replacing native `datetime-local`, portaled to body | `value` (datetime-local string), `min?`, `onChange`, `onClose`, `anchorRef`. Tested. |
| `PasswordStrengthBar` | `shared/components/password-strength-bar.tsx` | 4-segment strength bar (score 0–4) | `score: PasswordStrength`. |
| `AuthSubmitButton` | `shared/components/auth-submit-button.tsx` | Full-width hero CTA for auth screens (not the compact `Button`) | `children`, `className` + `ButtonHTMLAttributes`. |
| `AppWordmark` | `shared/components/app-wordmark.tsx` | Palladin logo + wordmark (login lg, sidebar sm) | `size` (sm / lg), `subtitle?` (sm only). |
| `ErrorBoundary` | `shared/components/error-boundary.tsx` | Per-feature route error boundary | standard class-component boundary. |

## Shared helpers (`shared/lib/`)

| Helper | File | Purpose |
|--------|------|---------|
| `HOVERABLE_CARD_CLASSES` | `shared/lib/styles.ts` | Single source for card/row hover lift (`--cv-card-hover`). Edit here to change hover everywhere. |
| `AUTH_BACKGROUND_GRADIENT` | `shared/lib/styles.ts` | Dark gradient bg for auth-surface pages. |
| `validation` | `shared/lib/validation.ts` | `required`, `validUrl`, `maxLen`, `firstError`. |
| `password-strength` | `shared/lib/password-strength.ts` | Password score (feeds `PasswordStrengthBar`). |
| `mnemonic` | `shared/lib/mnemonic.ts` | BIP39 recovery-phrase helpers. |
| `shorten-key` | `shared/lib/shorten-key.ts` | Prefix+suffix shortening for non-secret IDs/keys. |
| `analytics` | `shared/lib/analytics.ts` | `capture(module, event)` → auto-prefixes `fe:`. |
| `download-file` | `shared/lib/download-file.ts` | `downloadTextFile(filename, content, mime?)` — Blob → object-URL → click → revoke. |
| `permissions` / `jwt` | `shared/lib/permissions.ts`, `shared/lib/jwt.ts` | Permission-bit checks, JWT decode. |

## Controls to extract (missing shared components)

These patterns are duplicated 2+ times with no shared component. Extract on next touch.

| Proposed component | Proposed API | Duplication found |
|--------------------|-------------|-------------------|
| `DetailTabBar<T>` | `<DetailTabBar tabs={{id,label}[]} active onChange wide? actions? />` | **4 implementations** — `vaults/components/vault-detail-tabs.tsx` (canonical) + `api-keys/components/api-key-detail-tabs.tsx` (diverged copy) + inline at `vaults/entry-detail-page.tsx:255` and `agents/components/agent-detail.tsx:133`. |
| `SplitView` | `<SplitView left right />` | **7 pages** — `useWideScreen()` (comfortable-density breakpoint 1600) + `flex h-full` + left `w-[clamp(18.75rem,22vw,25rem)] shrink-0 border-r` + right `min-w-0 flex-1`. agents, api-keys, grants (×2), vaults (×3). |
| `InlineEditFooter` | `<InlineEditFooter onCancel onSave saving? disabled? cancelLabel? saveLabel? />` | **3 instances** — `mt-4 flex justify-end gap-2 border-t pt-4` at `agents/components/agent-edit-form.tsx:179`, `vaults/entry-detail-page.tsx:772`, `vaults/components/vault-settings-form.tsx:163` (in-page forms, `justify-end` — not modal `DialogFooter`). |

## Reuse rules

1. **Fields** — use `FormInput` (text/url/email), `SecretInput` (password show/hide), `FormTextarea` (multi-line). Never inline-style raw `<input>`/`<textarea>`. Raw `<input>` is only for custom composites (combobox, search bar) and must use the canonical class string in `CLAUDE.md`.
2. **Field feedback** — `FieldFeedback` (fixed height) or `FeedbackSlot` (animated) for inline validation only. API results go to Sonner toasts, never inline.
3. **Cards / rows hover** — route through `HOVERABLE_CARD_CLASSES`. Never inline `hover:bg-*` / `hover:border-*` / `shadow-*`. (Known offender: `agents/components/agent-card.tsx:39` inlines `hover:bg-[var(--cv-card-hover)]` + `rounded-xl` — align on next touch.)
4. **Modal footers** — always `DialogFooter` with the 1:2 (`flex-1` / `flex-[2]`) button ratio. Never a hand-rolled `<div className="mt-* flex">`.
5. **Glyphs** — `Icon` (Material Symbols Rounded). Don't hand-write `<span className="material-symbols-*">`.
6. **Filters** — `TypeFilterDropdown` for multi-select filter chips. Date pickers → `DateTimePicker`, never native `datetime-local`.
7. **Errors / retries** — `ErrorState` for failed query panels; `ErrorBoundary` at route level.
8. **Auth surfaces** — `AuthSubmitButton`, `AppWordmark`, `AUTH_BACKGROUND_GRADIENT`, and `class="dark"` on the outer div.
9. **Colors** — `var(--cv-*)` tokens only. Brand red via `--cv-primary` / `--cv-primary-rgb`. Audit colors via `tone()` in `audit-event-config.ts`.
10. **Skeletons / empty-states / tab strips / split-view / selects** — see "Controls to extract" above; use or create the shared component, never copy markup.
