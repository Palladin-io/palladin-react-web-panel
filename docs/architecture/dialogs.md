# Dialogs & Modal Footers

Read this when building or editing any modal/dialog. Every modal uses `ModalShell` for the shell (including its header + footer chrome) and `DialogFooter` for its action buttons — never a hand-rolled header/footer wrapper.

## Canonical dialog anatomy

A dialog is: **titled header (with a bottom divider) → internally-scrolling body → footer (with a top divider)**. `ModalShell` renders all three centrally so no dialog hand-rolls its own header row or footer strip.

```tsx
<ModalShell
  ariaLabel={t('vault.createVault')}
  title={t('vault.createVault')}
  onClose={isPending ? undefined : onClose}
  width={440}
  footer={
    <DialogFooter>
      <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
        {t('vault.cancel')}
      </Button>
      <Button variant="accent" size="sm" type="submit" form="create-vault-form" disabled={!canSubmit} className="flex-[2]">
        {t('vault.createVault')}
      </Button>
    </DialogFooter>
  }
>
  <form id="create-vault-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
    {/* fields only — no header, no footer */}
  </form>
</ModalShell>
```

### Shell (`shared/components/modal-shell.tsx`)

Owns the backdrop, Escape-to-dismiss, body scroll-lock, and opt-in focus management. Props:

- `ariaLabel` (required), `onClose?`, `width` (default **480**; use **560 for forms**), `children`.
- `title?` — **pass it to opt into the canonical chrome.** ModalShell then renders the header row (title + close button + `border-b border-[var(--cv-divider)]`), a scrollable body (`max-h-[86dvh]`, `overflow-y-auto`, **`overflow-x-hidden`**, `subtle-scrollbar`), and — if `footer` is set — a footer with `border-t`. `title` accepts a `ReactNode` (e.g. an icon + text).
- `titleClassName?` — narrow typography hook for the canonical header title; keep the default unless the established surface calls for another design token.
- `footer?` — the `DialogFooter` element (only used with `title`).
- `footerClassName?` — narrow surface hook on the canonical footer row; it does not replace `DialogFooter` or its action layout.
- `trapFocus?` — moves focus to the first focusable control, contains Tab/Shift+Tab, and restores the previously focused element when the dialog closes. Hidden and negative-tab-index controls are skipped; callback changes do not reset focus, and only the topmost modal handles keyboard events. Enable it for every new blocking/non-dismissible dialog; never hand-roll focus trapping in a feature component.
- Omit `title` for the legacy bare padded box (children own everything). New dialogs should always pass `title`.

### Form dialogs: submit from the footer

The footer lives outside the `<form>` (ModalShell renders them as siblings). Give the form an `id` and point the footer's submit button at it with `form="<id>"` (`<Button type="submit" form="create-vault-form">`). The form's `onSubmit` still fires.

### Body scroll + popovers

The body is the only scroll region and it clips horizontal overflow. **Any popover/menu inside a dialog must render through a portal to `document.body`** (fixed position, anchored to its trigger) — an absolutely-positioned menu is clipped by the body's `overflow`. See `PopoverMenu` / `EntryIconButton` (`features/vaults/components/`). This was a real bug: in-dialog menus opened but were invisible.

## Footer button pattern

All modal actions go in `DialogFooter` (`shared/components/dialog-footer.tsx`), passed to ModalShell's `footer` prop. Cancel + primary use a **1:2 flex ratio** — never `justify-center` or `justify-end`.

## Rules

- **Always pass `title` + `footer` to `ModalShell`** — don't hand-roll a header row or a footer strip inside `children`. No double borders.
- **Always use `DialogFooter`** inside `footer` for confirm/cancel actions.
- **`DialogFooter` is chrome-less** — it only lays out the buttons (`flex gap`). The footer's top divider, padding, and pinned position come from ModalShell's `footer` slot. Never give `DialogFooter` (or a footer passed to the slot) its own `border`, background tint, or negative-margin bleed — that double-chromes against the slot (a second divider + an empty band). This was a real regression.
- **Every button in the app is `size="sm"` (`h-action` / 36px, `text-action` / 14px) — ONE single height, no exceptions.** (`size="md"` exists in the type but must not be used.)
- Cancel: `variant="subtle"`, `className="flex-1"` (1/3). Primary: `variant="accent"` / `positive` / `danger`, `className="flex-[2]"` (2/3).
- Single-action footer ("Done" / "Close"): one `size="sm"` button, `flex-1` or `w-full`.
- Router `<Link>` styled as a footer button: use `PREMIUM_BUTTON_SM_CLASS` / `POSITIVE_BUTTON_SM_CLASS` from `button.tsx`.
- Field-feedback rhythm: use `FeedbackSlot` (animated, self-collapsing) below a field — **never** the fixed-`h-4` `FieldFeedback` + `-mb-4` wrapper (it overlaps the next label when an error shows). See `forms-and-validation.md`.

`DialogSurface` owns the reusable chrome rendered by titled `ModalShell`.
Consent startup and settings both use ModalShell at 480 design pixels
(600 CSS pixels at the default density). Consent is never embedded on a page;
the settings destination owns only a launcher and the dialog lifetime.
