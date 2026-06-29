# Styling & Design Tokens

Read this when styling any component. Core rule: **never hardcode hex/rgba in components — always use `var(--cv-*)` tokens.** Tokens are defined in `src/index.css` (`:root` = light, `.dark` = dark) and resolve automatically per theme.

## How theming works

- `@custom-variant dark (&:is(.dark *))` — the Tailwind `dark:` prefix applies when an element is inside a `.dark` ancestor.
- The `ThemeSync` provider toggles `dark` on `document.documentElement` based on user preference.
- **Dark-mode forced pages** (`/login`, `/unlock`, onboarding, recovery) put `class="dark"` on their outer div so tokens resolve to dark values regardless of the user's theme toggle — these pages always render on a dark gradient.
- `@theme { --font-sans: "Inter", … }` sets the app font.

## Token groups (`src/index.css`)

Every token has a light value in `:root` and a dark value in `.dark`. Use the token name; never the literal value.

### Text
| Token | Role |
|-------|------|
| `--cv-t1` | Primary text (highest contrast) |
| `--cv-t2` | Secondary text |
| `--cv-t3` | Tertiary / muted text |
| `--cv-label-text` | Form field labels |
| `--cv-icon-muted` | Muted glyph color |

### Surfaces
| Token | Role |
|-------|------|
| `--cv-card-bg` | Card / list-row surface |
| `--cv-card-hover` | Card hover lift (used by `HOVERABLE_CARD_CLASSES`) |
| `--cv-card-footer` | Card footer strip |
| `--cv-modal-bg` | Modal background |
| `--cv-bg-subtle` | Subtle fill / chip background |
| `--cv-empty-bg` | Empty-state dashed-box fill |
| `--cv-list-item-hover` | List-item hover background |

### Borders & dividers
| Token | Role |
|-------|------|
| `--cv-border` | Default border on cards/inputs |
| `--cv-divider` | Hairline divider between rows/sections |
| `--cv-empty-border` | Empty-state dashed border |

### Inputs
| Token | Role |
|-------|------|
| `--cv-input-bg` | Input background |
| `--cv-input-border` | Input border |
| `--cv-input-text` | Input text |
| `--cv-input-placeholder` | Placeholder text |

### Buttons
Per-variant tokens consumed by `button.tsx`: `--cv-btn-subtle-{bg,text,border,hover}`, `--cv-btn-outline-{text,border,hover}`, `--cv-btn-ghost-{text,hover}`. The premium variant uses `--cv-premium` (`#D4820A` light / `#F0C040` dark) plus the `.btn-premium` sweep-fill effect defined in `index.css`.

### State / semantic colors
Each has a solid value and an `-rgb` triplet for alpha tints via `rgb(var(--cv-x-rgb) / 0.12)`.

| Token | Value | Role |
|-------|-------|------|
| `--cv-primary` / `-hover` / `-rgb` | `#EB4747` | Brand red / danger |
| `--cv-success` / `-rgb` | `#10B981` | Success / approved |
| `--cv-info` / `-rgb` | `#60A5FA` | Info |
| `--cv-pending` / `-rgb` | `#FFAB87` | Pending / request access (`grant.requested`) |
| `--cv-neutral` / `-rgb` | `#8A95A6` | Neutral |
| `--cv-premium` | `#D4820A` / `#F0C040` | Premium / upgrade |

Usage: `text-[var(--cv-primary)]`, `bg-[rgb(var(--cv-primary-rgb)/0.12)]`. In inline JS styles: `'var(--cv-primary)'`, `'rgb(var(--cv-primary-rgb) / 0.12)'`.

### Audit-log colors
The audit taxonomy maps semantic roles (success / pending / info / danger / neutral) to the state tokens above, consumed via `tone()` in `src/features/audit/components/audit-event-config.ts`. Web ↔ mobile parity required. Canonical mapping: `.claude/memory/reference_audit_log_colors.md` (monorepo). Key facts: green is `#10B981` (never `#2EC4B6`); `agent.enrolled` = info/blue; pending/peach = `grant.requested`.

### Toasts
Sonner toasts wear the theme surface with a variant color as a left-border + icon accent (not a full color fill). `.cv-toast[data-type='success'|'error'|'warning'|'info']` set `--cv-toast-accent`. Sonner forces `padding:16px` + `border-radius:8px` on the toast — overrides for those don't win, so compute any footer/line bleed against 16/8.

## `styles.ts` helpers (`src/shared/lib/styles.ts`)

| Export | Use |
|--------|-----|
| `HOVERABLE_CARD_CLASSES` | The shared hover/focus class string for cards and list rows: `rounded-2xl`, `--cv-border`, `--cv-card-bg`, hover → `--cv-card-hover` (background lift, no shadow, no border change), focus-visible → `--cv-t1` border. **Edit here to change hover everywhere.** Never inline `hover:border-*` / `hover:bg-*` / `shadow-*` on card-like elements. |
| `AUTH_BACKGROUND_GRADIENT` | The dark gradient `background` value shared by every full-screen auth surface (login, unlock, onboarding, recovery). One constant so those screens stay identical as the palette evolves. |

Button class exports for `<Link>` elements that must look like footer buttons: `PREMIUM_BUTTON_SM_CLASS`, `POSITIVE_BUTTON_SM_CLASS` (from `button.tsx`).

## Helper CSS classes (`index.css`)
- `.secret-mask` — masks a `type=text` input with a disc font (used by `SecretInput`) so password managers never offer to save vault credentials. No real `type=password`.
- `.mi` — Material Symbols Rounded glyph span (1em square, clipped). Prefer the `Icon` component; this class is the underlying convention matching the Astro design system.
- `.step-enter` / `@keyframes step-enter` — wizard step entrance animation.
- `.btn-premium` — premium-button sweep-fill hover.

## Astro-reference fidelity

Before implementing any UI component, check `docs/design/astro/src/components/` for the Astro reference and match it 1:1 — shape (e.g. `rounded-[10px]` not `rounded-full`), background alphas, border styles (dashed vs solid), icon colors. Deviations from design prototypes are blocking review findings.

### Accepted deviations (do NOT flag as blocking)
Intentional UX improvements approved by the product owner:

| Area | Deviation | Reason |
|------|-----------|--------|
| Card shadows | `dark:shadow-*` only — no shadow in light mode | Avoids visual heaviness in light theme |
| Hover effect | Background lift (`hover:bg-[var(--cv-card-hover)]`), no shadow, both modes | Unified with the sidebar nav-item hover per product owner |
| Entry detail pickers | Icon + Color pickers side-by-side (`flex-row`) | Saves vertical space vs the stacked prototype |
| Premium colors | `#D4820A` light / `#F0C040` dark | Aligned to Astro tokens; tokens are the source of truth |
