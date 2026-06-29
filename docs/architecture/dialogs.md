# Dialogs & Modal Footers

Read this when building or editing any modal/dialog. Every modal uses `ModalShell` for the shell and `DialogFooter` for its actions — never a hand-rolled wrapper.

## Shell

`ModalShell` (`shared/components/modal-shell.tsx`) owns the backdrop, Escape-to-dismiss, and body scroll-lock. Props: `onClose?`, `ariaLabel`, `width` (default 480), `children`.

## Footer button pattern

All modal actions go in `DialogFooter` (`shared/components/dialog-footer.tsx`). Cancel + primary use a **1:2 flex ratio** — never `justify-center` or `justify-end`.

```tsx
import { DialogFooter } from '../../../shared/components/dialog-footer'

<DialogFooter>
  <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
    {t('vault.cancel')}
  </Button>
  <Button variant="accent" size="sm" type="submit" disabled={!canSubmit} className="flex-[2]">
    {t('...')}
  </Button>
</DialogFooter>
```

## Rules

- **Always use `DialogFooter`** — it owns the edge-bleed, top border, subtle tint, and the spacing above the footer (`mt-3` + `py-3.5`). Don't reproduce the strip inline.
- **Every button in the app is `size="sm"` (h-7 / 28px) — ONE single height, no exceptions.** Dialog footers are NOT taller than card/in-content buttons; opening a dialog must show a button the exact same height as the buttons on the cards. (`size="md"` exists in the type but must not be used.)
- Cancel: `variant="subtle"`, `className="flex-1"` (occupies 1/3).
- Primary: `variant="accent"` (or `positive` / `danger` per intent), `className="flex-[2]"` (occupies 2/3).
- Single-action footer (e.g. "Done" / "Close"): one `size="sm"` button with `className="flex-1"` or `w-full`.
- Router `<Link>` styled as a footer button: use `PREMIUM_BUTTON_SM_CLASS` / `POSITIVE_BUTTON_SM_CLASS` (the `sm` class exports from `button.tsx`) so it matches every other button's height.
- Apply to **every** `ModalShell` with confirm/cancel — create dialogs, icon browsers, approve/deny/revoke/grant-again, preferences, delete confirms.
