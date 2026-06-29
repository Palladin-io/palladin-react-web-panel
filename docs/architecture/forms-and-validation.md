# Forms, Fields & Validation

Read this when building a form, wiring field validation, or implementing an inline-edit detail panel.

## Shared field components

Never inline-style a raw `<input>` or `<textarea>`. Use the shared components:

| Use case | Component | Import |
|----------|-----------|--------|
| Text / URL / email with label | `FormInput` | `shared/components/form-field` |
| Password with show/hide toggle | `SecretInput` | `shared/components/secret-input` |
| Multi-line textarea with label | `FormTextarea` | `shared/components/form-textarea` (add `monospace` for code/key fields) |

All share `text-[12px]`, `border-[var(--cv-input-border)]`, `focus:border-[var(--cv-t1)]`. Full props in `component-catalog.md`.

### Raw `<input>` — only for custom composites (combobox, search bar)

When a raw `<input>` is unavoidable (e.g. combobox with `role="combobox"`, search bar with embedded icon), use this exact class string so styling stays consistent:

```tsx
className="w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
  px-3 py-2 text-[12px] text-[var(--cv-input-text)]
  placeholder:text-[var(--cv-input-placeholder)]
  focus:border-[var(--cv-t1)] focus:outline-none transition-colors
  disabled:cursor-not-allowed disabled:opacity-40"
```

Never add hardcoded hex or rgba colors to an input — always use `var(--cv-*)` tokens.

## Validation & notifications — three distinct layers, never mixed

| Layer | Trigger | Component | Location |
|-------|---------|-----------|----------|
| Field validation | `onBlur` (on leave) | `FieldFeedback` below the input | Inline, animated |
| Backend errors | `onError` callback | `toast.error(message)` | Top-right toast |
| Backend success | `onSuccess` callback | `toast.success(message)` | Top-right toast |

**Rules:**
1. **Never use `required` or `type="url"` HTML attributes** — they trigger unstyled, inconsistent browser native validation bubbles. Remove them and validate manually.
2. **Field validation fires on `onBlur`** — not on submit, not on change. Set error state on blur, clear it on change.
3. **Shared validators live in `src/shared/lib/validation.ts`** — use `required(message)`, `validUrl(message)`, `maxLen(n, message)`, `firstError(value, validators)`. Never write inline validation logic.
4. **`FieldFeedback` is for field-level errors only** — never use it to display API success/error results.
5. **All API results → Sonner toast** — `toast.error(t('key'))` in `onError`, `toast.success(t('key'))` in `onSuccess`. Toaster is mounted once in `Providers` at `position="top-right"`.
6. **No inline `<p>` error elements** — remove any `<p className="text-[11px] text-[#FF4F4F]">` or state-driven error JSX for API errors. Use a toast instead.

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
<FieldFeedback visible={urlError} color="red">
  {t('validation.invalidUrl')}
</FieldFeedback>
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
<FieldFeedback visible={nameError} color="red">
  {t('validation.required')}
</FieldFeedback>
```

`FeedbackSlot` is the animated-height variant of `FieldFeedback` — use it when the feedback should push content below it down as it appears (e.g. multi-step wizards).

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
