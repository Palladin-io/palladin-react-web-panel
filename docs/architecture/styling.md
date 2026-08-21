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
| `--cv-search-bg` | Search/filter chrome; aliases the card surface, not the form input surface |
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
| `METADATA_BADGE_CLASSES` | Canonical compact pill geometry (`h-5`, `px-2`, `text-micro`, semibold). Use for owner/type/status badges in list and detail headers; callers add only semantic colours and optional icon. In two-line card identities, place the badge in the first-line flex row beside the primary label — never as a sibling centered against both lines. |
| `AUTH_BACKGROUND_GRADIENT` | The dark gradient `background` value shared by every full-screen auth surface (login, unlock, onboarding, recovery). One constant so those screens stay identical as the palette evolves. |

Button class exports for `<Link>` elements that must look like footer buttons: `PREMIUM_BUTTON_SM_CLASS`, `POSITIVE_BUTTON_SM_CLASS` (from `button.tsx`).

## Helper CSS classes (`index.css`)
- `.secret-mask` — masks a `type=text` input with a disc font (used by `SecretInput`) so password managers never offer to save vault credentials. No real `type=password`.
- `.mi` — Material Symbols Rounded glyph span (1em square, clipped). Prefer the `Icon` component; this class is the underlying convention.
- `.step-enter` / `@keyframes step-enter` — wizard step entrance animation (fade + translateY).
- `.btn-premium` — premium-button sweep-fill hover.
- `.tab-strip-scroll` — keeps detail tabs horizontally scrollable without exposing an overlay scrollbar thumb beside the last tab.

## Radius, spacing & type conventions

Tailwind utilities, applied consistently (no radius/spacing tokens exist — these are conventions, follow the prevailing values):

| Concern | Convention |
|---------|-----------|
| Card / list-row radius | `rounded-2xl` (matches `HOVERABLE_CARD_CLASSES`) |
| Smaller card / panel radius | `rounded-xl` |
| Input / button radius | `rounded-lg` |
| Avatars, pills, chips | `rounded-full` |
| Page container padding | `px-4 py-4` (the `panel-content` standard) |
| Body / control text | `text-ui` (15px) |
| Secondary / meta text | `text-meta` (14px) |
| Button label | `text-action` (14px, semibold) |
| Micro labels | `text-micro` (12px minimum) |
| Small heading | `text-heading-sm` (16px) |
| Section / card heading | `text-heading` (18px) |
| Page title | `text-page-title` (24px) |
| Auth title | `text-auth-title` (27.5px) |
| Display / hero | `text-display` (35px) |

The semantic type utilities above are generated from `--text-*` tokens in the
`@theme` block in `src/index.css`. The root `html` font size is 125%, matching
the panel's former comfortable browser-zoom working size. This scales standard
Tailwind spacing, radii and dimensions together; `--cv-density-scale` covers
numeric icon/avatar sizes that cannot inherit rem sizing.

Use semantic utilities instead of arbitrary `text-[Npx]` values. Inputs are
44px high (`h-control`), default buttons are 36px high (`h-action`) with
14px `text-action` labels, the sidebar
is 250px wide (`w-sidebar`), and no informational text renders below 12px.
Never add CSS `zoom` or `transform: scale()` to simulate density.

All list/search surfaces use the shared `SearchBar`: `h-control`, `text-ui`, a
16-design-pixel search icon, and `--cv-search-bg` (the same surface as cards).
Form fields deliberately remain on `--cv-input-bg` so editable data stands out.

When in doubt, choose the token by semantic role rather than copying a nearby
pixel value. Monospace content (keys, hashes, script) uses the same size token
as its surrounding role; only the font family changes.

## Adding a new token

1. Add the variable to **both** `:root` and `.dark` in `src/index.css` — never light-only.
2. If it needs alpha tints, also add an `-rgb` triplet sibling (space-separated, e.g. `235 71 71`) and consume via `rgb(var(--cv-x-rgb) / <alpha>)`.
3. Name by **role, not appearance** (`--cv-empty-border`, not `--cv-grey-12`).
4. Document it in the matching table above.
5. Reach for a new token only when an existing one doesn't fit semantically — prefer reuse.

## Design reference

An Astro prototype exists under `../design/` but is **outdated** and is **NOT a binding reference** — the product style has since changed significantly. Use it only as loose inspiration. When in doubt about visual design (spacing, shape, a new component's look), **ask the user** rather than copying the prototype. There is no "match the prototype 1:1" rule and no blocking-deviation list.
