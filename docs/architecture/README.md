# Architecture Reference

Per-feature and shared-component reference for the Palladin web panel. These docs are the contract for *what already exists* so new work reuses it instead of reinventing it.

## Reuse-first philosophy

**Before building any control, check the catalog.** If a shared component covers the use case, use it. If a pattern (skeleton, empty-state, tab strip, split-view, select…) appears **2+ times**, extract it into `src/shared/components/` rather than copy-pasting markup.

- Never inline raw `<input>`/`<textarea>` styling — use `FormInput` / `SecretInput` / `FormTextarea`.
- Never inline hover classes on cards/rows — use `HOVERABLE_CARD_CLASSES`.
- Never hand-roll a modal footer — use `DialogFooter`.
- Never hardcode hex colors — use `var(--cv-*)` tokens.

**Before working on a feature, read its doc in `docs/architecture/features/<feature>.md` first.** It tells you the existing components, hooks, queries, patterns, and cross-feature dependencies so you extend rather than duplicate.

## Index

| Doc | Scope |
|-----|-------|
| [component-catalog.md](component-catalog.md) | Every shared/reusable control: name, path, purpose, props. Controls still to extract. Reuse rules. |

### Feature docs

| Feature | Doc |
|---------|-----|
| Auth (OAuth login) | [features/auth.md](features/auth.md) |
| Onboarding | [features/onboarding.md](features/onboarding.md) |
| Unlock | [features/unlock.md](features/unlock.md) |
| Recovery | [features/recovery.md](features/recovery.md) |
| Vaults & Entries | [features/vaults.md](features/vaults.md) |
| Agents | [features/agents.md](features/agents.md) |
| Grants | [features/grants.md](features/grants.md) |
| Audit | [features/audit.md](features/audit.md) |
| API Keys | [features/api-keys.md](features/api-keys.md) |
| Notifications | [features/notifications.md](features/notifications.md) |
| Settings | [features/settings.md](features/settings.md) |

### Not yet implemented

`billing/`, `teams/`, `dashboard/` are placeholder directories (`.gitkeep` only) — no implementation yet. `dev/` holds `ToastsShowcase`, a dev-only visual test page for Sonner toast variants (not routed in production).
