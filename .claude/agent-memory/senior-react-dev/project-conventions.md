---
name: project-conventions
description: Confirmed code conventions for the Claw Vault React web panel
metadata:
  type: project
---

Patterns verified while implementing CVT-39 (settings + API keys):

- **Locale files are FLAT dotted keys**, not nested objects. `en.json`/`pl.json`
  use `"feature.subKey": "value"` at the top level. Both files must be updated together.
- **API responses are parsed with Zod** — define `z.object(...)` schemas in the
  feature's `api/*.ts`, call `schema.parse(await api.get(...).json())`. `zod@4` is a dep.
- **HTTP client** is `ky` exported as `api` from `shared/api/client.ts` — `api.get('api/...').json()`.
  204-returning endpoints: `await api.put(...)` and resolve void.
- **Feature isolation is enforced** — features import from `shared/` only, never from
  each other. Exception observed: a page may compose another feature's exported
  component via its `index.ts` barrel (settings-page imports `ApiKeyList` from `../api-keys`).
- **Shared ModalShell** lives at `shared/components/modal-shell.tsx` (added in CVT-39).
  An older copy still exists in `vaults/components/modal-shell.tsx` — vault dialogs
  still use that one; new features use the shared one.
- **Mutation hooks**: thin `useMutation` wrapper, `onSuccess` invalidates the related
  query key. Query keys are exported consts (e.g. `API_KEYS_QUERY_KEY`).
- **Analytics**: `analytics.capture(module, event)` auto-prefixes `fe:`. Never include prefix.
- **Tests**: mock the feature hook at module level with a controllable `mutateMock`
  driving `onSuccess`/`onError`; real `QueryClient` in wrapper; mock analytics with `vi.fn()`.
  CI runs `build` + `test` (not `lint`).
- **Split-view master-detail pattern**: standalone pages use `useWideScreen(1280)`.
  Wide = left list panel `w-[clamp(300px,22vw,400px)]` + right detail `flex-1`.
  Narrow = single column keyed off route param presence. Reference impls:
  `vaults/entry-detail-page.tsx` and `api-keys/api-keys-page.tsx`. Selected row
  highlight: `HOVERABLE_CARD_CLASSES` + `!border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]`.
- **No router in unit tests**: components using `<Link>` from `@tanstack/react-router`
  must `vi.mock('@tanstack/react-router', () => ({ Link: ... }))` — no test spins up
  a real router. Stub `Link` to a plain `<a>`.
- **Plural i18n keys** use i18next suffixes: `key_one`/`key_other` (en),
  `key_one`/`key_few`/`key_many`/`key_other` (pl). Call `t('key', { count })`.
