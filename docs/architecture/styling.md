# Styling & Design Tokens

The styling guide for the web panel. **Core rule: never hardcode hex/rgba in components — always use `var(--cv-*)` tokens.** Tokens are defined in `src/index.css` (`:root` = light, `.dark` = dark) and resolve automatically per theme.

## How theming works

- `@custom-variant dark (&:is(.dark *))` — the Tailwind `dark:` prefix applies when an element is inside a `.dark` ancestor.
- The `ThemeSync` provider toggles `dark` on `document.documentElement` based on user preference.
- **Dark-mode forced pages** (`/login`, `/unlock`, onboarding, recovery) put `class="dark"` on their outer div so tokens resolve to dark values regardless of the user's theme toggle — these pages always render on a dark gradient.
- `@theme { --font-sans: "Inter", … }` sets the app font (Inter).

Because every `--cv-*` token has both a `:root` and a `.dark` value, **using the token is what makes a component theme-correct** — you almost never need a `dark:` utility for color. Reach for `dark:` only for the rare structural difference (e.g. a shadow that exists only in dark mode).

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
Per-variant tokens consumed by `button.tsx`:
- Subtle: `--cv-btn-subtle-{bg,text,border,hover}`
- Outline: `--cv-btn-outline-{text,border,hover}`
- Ghost: `--cv-btn-ghost-{text,hover}`
- Premium: `--cv-premium` (`#D4820A` light / `#F0C040` dark) + the `.btn-premium` sweep-fill effect.

Accent / danger / positive variants reuse the state tokens below.

### State / semantic colors
Each has a solid value and an `-rgb` triplet for alpha tints via `rgb(var(--cv-x-rgb) / 0.12)`.

| Token | Value | Role |
|-------|-------|------|
| `--cv-primary` / `-hover` / `-rgb` | `#EB4747` / `#D43E3E` / `235 71 71` | Brand red / danger |
| `--cv-success` / `-rgb` | `#10B981` / `16 185 129` | Success / approved |
| `--cv-info` / `-rgb` | `#60A5FA` / `96 165 250` | Info |
| `--cv-pending` / `-rgb` | `#FFAB87` / `255 171 135` | Pending / request access |
| `--cv-neutral` / `-rgb` | `#8A95A6` / `138 149 166` | Neutral |
| `--cv-premium` | `#D4820A` / `#F0C040` | Premium / upgrade |

Usage: `text-[var(--cv-primary)]`, `bg-[rgb(var(--cv-primary-rgb)/0.12)]`. In inline JS styles: `'var(--cv-primary)'`, `'rgb(var(--cv-primary-rgb) / 0.12)'`.

> **Audit-log colors** (which event maps to which semantic role) are documented in `docs/architecture/features/audit.md` — that is the canonical taxonomy. The state tokens above are the underlying palette.

### Toasts
Sonner toasts wear the theme surface with a variant color as a left-border + icon accent (not a full color fill). `.cv-toast[data-type='success'|'error'|'warning'|'info']` set `--cv-toast-accent`. Sonner forces `padding:16px` + `border-radius:8px` on the toast — overrides for those don't win, so compute any footer/line bleed against 16/8.

## `styles.ts` helpers (`src/shared/lib/styles.ts`)

| Export | Use |
|--------|-----|
| `HOVERABLE_CARD_CLASSES` | Shared hover/focus class string for cards and list rows: `rounded-2xl`, `--cv-border`, `--cv-card-bg`, hover → `--cv-card-hover` (background lift, no shadow, no border change), focus-visible → `--cv-t1` border. **Edit here to change hover everywhere.** Never inline `hover:border-*` / `hover:bg-*` / `shadow-*` on card-like elements. |
| `AUTH_BACKGROUND_GRADIENT` | The dark gradient `background` value shared by every full-screen auth surface (login, unlock, onboarding, recovery). One constant so those screens stay identical as the palette evolves. |

Button class exports for `<Link>` elements that must look like footer buttons: `PREMIUM_BUTTON_SM_CLASS`, `POSITIVE_BUTTON_SM_CLASS` (from `button.tsx`).

## Helper CSS classes (`index.css`)
- `.secret-mask` — masks a `type=text` input with a disc font (used by `SecretInput`) so password managers never offer to save vault credentials. No real `type=password`.
- `.mi` — Material Symbols Rounded glyph span (1em square, clipped). Prefer the `Icon` component; this class is the underlying convention.
- `.step-enter` / `@keyframes step-enter` — wizard step entrance animation (fade + translateY).
- `.btn-premium` — premium-button sweep-fill hover.

## Radius, spacing & type conventions

Tailwind utilities, applied consistently (no radius/spacing tokens exist — these are conventions, follow the prevailing values):

| Concern | Convention |
|---------|-----------|
| Card / list-row radius | `rounded-2xl` (matches `HOVERABLE_CARD_CLASSES`) |
| Smaller card / panel radius | `rounded-xl` |
| Input / button radius | `rounded-lg` |
| Avatars, pills, chips | `rounded-full` |
| Page container padding | `px-4 py-4` (the `panel-content` standard) |
| Body / control text | `text-[12px]` (inputs, buttons, most UI) |
| Secondary / meta text | `text-[11px]` |
| Micro labels | `text-[10px]` |
| Section / card headings | `text-[13px]`–`text-[15px]` |

When in doubt, copy the prevailing value from a neighbouring canonical component (Vaults / Agents / org-grants) rather than introducing a new one.

## Adding a new token

1. Add the variable to **both** `:root` and `.dark` in `src/index.css` — never light-only.
2. If it needs alpha tints, also add an `-rgb` triplet sibling (space-separated, e.g. `235 71 71`) and consume via `rgb(var(--cv-x-rgb) / <alpha>)`.
3. Name by **role, not appearance** (`--cv-empty-border`, not `--cv-grey-12`).
4. Document it in the matching table above.
5. Reach for a new token only when an existing one doesn't fit semantically — prefer reuse.

## Design reference

An Astro prototype exists under `docs/design/` but is **outdated** and is **NOT a binding reference** — the product style has since changed significantly. Use it only as loose inspiration. When in doubt about visual design (spacing, shape, a new component's look), **ask the user** rather than copying the prototype. There is no "match the prototype 1:1" rule and no blocking-deviation list.
