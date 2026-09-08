# Forms, Fields & Validation

Read this when building a form, wiring field validation, or implementing an inline-edit detail panel.

## Shared field components

Never inline-style a raw `<input>` or `<textarea>`. Use the shared components:

| Use case | Component | Import |
|----------|-----------|--------|
| Text / URL / email with label | `FormInput` | `shared/components/form-field` |
| Password with show/hide toggle | `SecretInput` | `shared/components/secret-input` |
| Multi-line textarea with label | `FormTextarea` | `shared/components/form-textarea` (add `monospace` for code/key fields) |

All share `h-control` (44px), `text-ui`, `border-[var(--cv-input-border)]`, and
`focus:border-[var(--cv-t1)]`. Full props in `component-catalog.md`.

### Raw `<input>` — only for custom composites (combobox, search bar)

When a raw `<input>` is unavoidable (e.g. combobox with `role="combobox"`, search bar with embedded icon), use this exact class string so styling stays consistent:

```tsx
className="h-control w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
  px-3 text-ui text-[var(--cv-input-text)]
  placeholder:text-[var(--cv-input-placeholder)]
  focus:border-[var(--cv-t1)] focus:outline-none transition-colors
  disabled:cursor-not-allowed disabled:opacity-40"
```

Never add hardcoded hex or rgba colors to an input — always use `var(--cv-*)` tokens.

## Validation & notifications — three distinct layers, never mixed

| Layer | Trigger | Component | Location |
|-------|---------|-----------|----------|
| Field validation | `onBlur` (on leave) | `FeedbackSlot` below the input (see below) | Inline, animated |
| Backend errors | `onError` callback | `toast.error(message)` | Top-right toast |
| Backend success | `onSuccess` callback | `toast.success(message)` | Top-right toast |

**Rules:**
1. **Never use `required` or `type="url"` HTML attributes** — they trigger unstyled, inconsistent browser native validation bubbles. Remove them and validate manually.
2. **Field validation fires on `onBlur`** — not on submit, not on change. Set error state on blur, clear it on change.
3. **Shared validators live in `src/shared/lib/validation.ts`** — use `required(message)`, `validUrl(message)`, `maxLen(n, message)`, `firstError(value, validators)`. Never write inline validation logic.
4. **`FieldFeedback` is for field-level errors only** — never use it to display API success/error results.
5. **All API results → Sonner toast** — `toast.error(t('key'))` in `onError`, `toast.success(t('key'))` in `onSuccess`. Toaster is mounted once in `Providers` at `position="top-right"`.
6. **No inline `<p>` error elements** — remove any one-off error paragraph or state-driven error JSX for API errors. Use a toast instead.

### URL validation pattern

```tsx
import { firstError, validUrl } from '../../shared/lib/validation'

const [urlError, setUrlError] = useState(false)

<FormInput
  value={url}
  onChange={(e) => { setUrl(e.target.value); setUrlError(false) }}
  onBlur={() =>
    setUrlError(firstError(url.trim(), [validUrl(t('validation.invalidUrl'))]) !== null)
  }
/>
<FeedbackSlot visible={urlError} color="red">
  {t('validation.invalidUrl')}
</FeedbackSlot>
```

### Required field pattern

```tsx
import { firstError, required } from '../../shared/lib/validation'

const [nameError, setNameError] = useState(false)

<FormInput
  value={name}
  onChange={(e) => { setName(e.target.value); setNameError(false) }}
  onBlur={() =>
    setNameError(firstError(name, [required(t('validation.required'))]) !== null)
  }
/>
<FeedbackSlot visible={nameError} color="red">
  {t('validation.required')}
</FeedbackSlot>
```

## Inline feedback: `FeedbackSlot` (canonical) vs `FieldFeedback`

Field wrappers and their inner control containers explicitly fill the available width with `w-full min-w-0`. Both feedback components live in `shared/components/form-field`. **Default to `FeedbackSlot`.**

- **`FeedbackSlot`** — animates its *own* height via the CSS grid `0fr → 1fr` rows trick. It occupies **zero height when hidden** and expands to reveal the message when shown, pushing the fields below it down smoothly. Because it reserves its own space only when visible, it never overlaps neighbouring content. Wrapped messages use automatic height and remain fully readable on narrow screens; hidden messages are also hidden from assistive technology. This is the canonical inline-feedback control.
- **`FieldFeedback`** — a fixed `h-feedback` (20px rendered) row that is always present (opacity-toggled). Use it **only** in a rigid grid/table cell whose row height is already fixed and must not reflow (rare). It has no importers in feature forms today.

**Forbidden pattern — do not reintroduce:** `FieldFeedback` wrapped in a negative-margin compensator (`<div className="-mb-4">…`) to "hide" its reserved height when there's no error. This looks fine with no error but, when the error appears, the message renders *on top of the next field's label* (the `-mb-4` pulls the following field up into the feedback's box). This exact pattern caused a label-overlap regression. If you find a `-mb-4`/`-mb-3` around a feedback row, replace the pair with a plain `FeedbackSlot`.

## Form rhythm

A form body is a single vertical stack with a consistent gap:

```tsx
<form className="flex flex-col gap-3">   {/* 15px rendered rhythm between fields */}
  <div>
    <FormInput … error={urlError} onBlur={…} />
    <FeedbackSlot visible={urlError} color="red">{t('validation.invalidUrl')}</FeedbackSlot>
  </div>
  {/* next field … */}
</form>
```

- The container is `flex flex-col gap-3` (12 px). Never hand-tune per-field margins to fake the rhythm.
- **Each validated field is wrapped in its own `<div>`** holding the `FormInput`/`SecretInput` **and** its `FeedbackSlot`. That keeps the collapsing feedback height inside the field's box: with no error the gap stays 12 px; with an error the slot expands inside the box and the next field's label stays 12 px below it — no overlap.
- Fields without validation (e.g. an optional description) can be direct children of the stack — no wrapper needed.

## `FormInput` extras: `labelSuffix` and `trailingAction`

`FormInput` supports two optional props beyond the basics:

- **`labelSuffix`** — a muted inline addendum after the label text, for a short qualifier such as `· visible to agents`. Rendered in `--cv-t3` at label weight; do not pass a full sentence.
  ```tsx
  <FormInput label={t('vault.entries.descriptionLabel')} labelSuffix={<>· {t('vault.entries.agentVisibleNote')}</>} … />
  ```
- **`trailingAction`** — an icon button rendered inside the input on the right, for an in-field affordance (open URL in new tab, reveal, copy). Shape: `{ icon, label, onClick, show? }`. `show` gates visibility (e.g. only when the URL parses to a domain). Use for actions that operate on the field's current value.
  ```tsx
  <FormInput … trailingAction={{ icon: 'open_in_new', label: t('vault.entry.openInBrowser'),
    onClick: () => openExternalUrl(url), show: !!extractDomain(url) }} />
  ```

`SecretInput` has its own in-field action cluster (reveal, optional `copyable`, optional `onGenerate`). The **password generator** is opted in with `onGenerate`: it renders the shared `PasswordGeneratorPopover` (portaled per `dialogs.md`) and hands back the generated value — the caller stores it **and** reveals the field so the user sees what they got (`onGenerate={(pw) => { setValue(pw); setShown(true) }}`). Generation uses `shared/crypto/password-generator` (`crypto.getRandomValues` + rejection sampling); the value is a secret — never log it or send it to analytics (only `length` + charset flags are tracked).

## Add-on-demand sections (ghost affordance)

Optional secondary fields (Notes, 2FA) are **hidden behind a discreet ghost affordance** rather than shown as an always-present empty field, keeping the default form short. Pattern:

- Collapsed: a single full-width ghost row — `add` icon + label (e.g. "Add notes"), styled like the "+ Add field" row in `CustomFieldsEditor` (`text-[var(--cv-btn-ghost-text)]`, `hover:bg-[var(--cv-btn-ghost-hover)]`). Place it at the **end** of its group (e.g. after Custom fields).
- Expanded: clicking reveals the real control (and focuses it). It collapses back to the affordance when left empty on blur.
- **Pre-open when data exists:** derive visibility from the *current* value, not just the initial mount — `open = userOpened || value.trim() !== ''`. That way an entry that already has a value (edit/detail) renders open, and a value that arrives asynchronously (e.g. after decrypt) opens the field in the *same* render — no one-frame flash of the affordance, and no effect to keep in sync (deriving beats syncing here, and avoids a test-timing flake).
- Purely presentational — the underlying data model / blob is unchanged. Reference: `NotesField` (`features/vaults/components/notes-field.tsx`) and the empty-state of `CredentialTotpField`.

## `SectionHeader` — form section dividers

Group related fields under `SectionHeader` (`features/vaults/components/section-header.tsx`) — a small label with a trailing hairline rule. Use it to separate logical blocks in a longer form (e.g. `Two-factor authentication`, `Custom fields`, script `References`). Don't hand-roll a bold label + `<hr>`; don't force uppercase (sentence/label case only).

## Inline edit pattern (always-visible fields)

Detail panels show fields **always visible** — no pencil/edit-mode toggle. Interactivity is gated by a `canEdit` prop derived at the parent level:

```tsx
// Parent — derive canEdit from permission + resource status
const canEdit = canManage && resource.status === 'active'
<ResourceEditForm resource={resource} canEdit={canEdit} />
```

Inside the form:
- All fields: `disabled={!canEdit || isPending}`
- Save button: rendered only when `canEdit`, disabled when `!canSubmit`
- `canSubmit = canEdit && isDirty && isValid && !isPending`
- Dirty check: compare `.trim()`-ed field values against the original resource props

**Form state reset on split-view navigation** — reset when the selected entity changes, not on every refetch:

```tsx
useEffect(() => {
  setName(resource.name ?? '')
  setType(resource.type ?? '')
  // ...other fields
}, [resource.resourceId])  // entity ID as dependency, not the full object
```

The inline-edit save/discard row is currently hand-rolled in three places (`agent-edit-form`, `entry-detail-page`, `vault-settings-form`) — it is a candidate for an `InlineEditFooter` shared component (see `component-catalog.md`). It uses `justify-end` (not the modal `DialogFooter` 1:2 ratio) because these are in-page forms, not modals.
