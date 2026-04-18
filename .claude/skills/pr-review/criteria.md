# PR Review Criteria — Claw Vault React Web Panel

Detailed checklist for each review category. Load this file in full before starting the review.

---

## 1. TypeScript Correctness

- **No `any`** — strict mode is enabled; `any` defeats the type system. Use `unknown` + narrowing, or a proper typed interface.
- **Interfaces for object shapes** — `interface Foo { … }`. Use `type` only for unions, intersections, or aliases.
- **Zod schemas as source of truth** — form validation schemas and API response parsers must use Zod. Duplicate hand-written type declarations beside a Zod schema are a smell.
- **No non-null assertions (`!`)** on values that can genuinely be null — use optional chaining or a guard instead.
- **Avoid `as` casts** unless narrowing is impossible (e.g. DOM events). A cast from `unknown` is fine; a cast that hides a type error is not.

---

## 2. Component Consistency — Shared Components

### Input fields
- All text inputs use the shared `FormField` component from `src/shared/components/` — no custom `<input>` with manual Tailwind border/focus styling.
- Error state uses the error prop on `FormField` — no custom red-border inline logic.
- Never duplicate input animation, focus ring, or label styles inline.

### Buttons
- Primary actions use the shared primary button component — no custom `<button>` with manually replicated color/padding/hover styles.

### Layout & spacing
- Page shells and spacing tokens follow existing patterns in the codebase — no one-off margin/padding values that deviate from the established scale.

### No inline style duplication
- If the same Tailwind class combination appears 3+ times across files, it should be extracted into a shared component or a composed Tailwind class via the design system — not copy-pasted.

---

## 3. i18n — Internationalisation

- **No hardcoded user-facing strings** in TSX/TS files — every visible string must be in `src/locales/en.json` and `src/locales/pl.json`.
- Use `t('key')` via `useTranslation()` in functional components; `i18n.t('key')` in class components or non-component contexts.
- Key naming: `feature.actionOrLabel` (camelCase within feature namespace, dot-separated) — e.g. `auth.loginTitle`, `onboarding.masterPasswordLabel`.
- Dynamic values use interpolation: `t('onboarding.confirmWordLabel', { index: n })` with `{{index}}` in the JSON value.
- Both `en.json` and `pl.json` must be updated together — no key present in one but missing in the other.
- After adding keys, verify the Polish translation is meaningful (not just a copy of the English string).

---

## 4. Security

- **Crypto layer isolation** — all encryption/decryption must live in `src/shared/crypto/`. No crypto operations (libsodium calls) in feature components, hooks, or stores.
- **Keys in memory only** — master key (MK), private key, vault key (VK) must only exist in Zustand store (JS memory). Never written to `localStorage`, `sessionStorage`, or `IndexedDB`.
- **No sensitive data in logs** — passwords, keys, tokens, mnemonics must never appear in `console.log`, `console.error`, or analytics calls.
- **No secrets in source** — no API keys, hardcoded base URLs for production, or tokens in source files; use `VITE_*` env vars.
- **Sanitize user content** — any user-provided string rendered as HTML must be sanitized. Prefer text content over `dangerouslySetInnerHTML`.

---

## 5. State Management

- **TanStack Query for server state** — data fetched from the API belongs in a Query, not in Zustand. Never duplicate server data into a Zustand store.
- **Zustand for client-only state** — in-memory crypto keys, UI preferences, unlocked state.
- **No prop drilling past 2 levels** — use context, Zustand, or TanStack Query instead.
- **Query invalidation** — after mutations, invalidate the relevant queries rather than manually updating Zustand.
- **No `useEffect` for derived state** — values that can be computed from existing state/props should be derived inline, not stored in `useState` + `useEffect`.

---

## 6. Analytics

- Format: `fe:{module}:{event}` — e.g. `fe:auth:login-page-viewed`, `fe:vault:create-wizard-opened`.
- Only **UI events** — page views, wizard interactions, button clicks. No business logic events (those are tracked by backend).
- Analytics calls belong in `useEffect` (page-viewed), event callbacks, or `BlocListener`-equivalent side effects — **never** inside the render path.
- No duplicate events: if the backend fires `be:vault:vault-created`, the frontend must NOT also fire a `vault-created` event.

---

## 7. React Patterns

### Rules of Hooks
- All hook calls (`useState`, `useEffect`, `useRef`, `useNavigate`, custom hooks) at the **top of the component** — never after conditional returns, inside loops, or inside event handlers.
- `useEffect` cleanup: every effect that sets up a subscription, timer, or event listener must return a cleanup function.

### Component design
- **Functional components only** — no class components except where React requires them (error boundaries). Error boundary class components should use `i18n.t()` directly, not hooks.
- Side effects (navigation, toasts, analytics) in `useEffect` or event callbacks — never in the render function body.
- No `key` props using array index when the list can reorder or items can be added/removed — use stable IDs.

### Routing (TanStack Router)
- Routes defined as file-based routes under `src/routes/` — no programmatic `createRoute` scattered across feature files.
- Type-safe navigation: `useNavigate`, `Link`, `Route.useParams()` — no raw string paths passed to `navigate()` without the router's type inference.
- Route guards/redirects handled in `beforeLoad` or `loader` — not scattered across component `useEffect`s.

---

## 8. Tests

- Test files co-located with components: `Component.test.tsx` next to `Component.tsx`.
- Use `@testing-library/react` — query by accessible role, label, or text; avoid querying by CSS class or test ID where possible.
- Mocking: mock at the module boundary (API client, crypto functions) — not deep inside component internals.
- New interactive components (forms, multi-step wizards) must have at minimum: render smoke test, user interaction test, error state test.
- `npm test` must pass — no test left broken or skipped without justification.

---

## 9. Over-Engineering Check

Flag any of the following:
- A custom hook that wraps a single `useState` call with no additional logic.
- A new Zustand slice for data that belongs in TanStack Query.
- An abstraction (HOC, provider, context) with exactly one consumer.
- More than two levels of component composition to achieve a simple visual layout.
- Speculative props or configuration added "for future flexibility" with no current use.
- A Zod schema defined twice — once for the form and once for the API response — when the shape is identical.
