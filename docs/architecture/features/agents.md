# Feature: agents

**Path:** `src/features/agents/`

## What it does
Manage the org's AI agents: review enrolment requests, approve/deny them, and inspect each agent's grants and activity.

## How it's organized
A split-view page — agent list (cards) on the left, agent detail on the right. The detail view has its own tab strip (Overview / Grants / Logs) and an always-visible inline-edit form gated by `canEdit`. Enrolment approve/deny are modal dialogs; the avatar and agent card are reusable pieces. Data comes from an agents query hook.

## Key patterns
- **Enrolment is a status transition, not client crypto** — the approve/deny dialogs flip state; the backend owns enrolment cryptography.
- Split-view + inline tab strip — candidates for shared `SplitView` / `DetailTabBar`.
- `AgentCard` currently inlines its hover classes instead of `HOVERABLE_CARD_CLASSES` — align on next touch.

## Cross-feature deps
- **Exports `AgentCard`** (reused by `api-keys` Agents tab — the main card-level cross-feature reuse), plus `AgentAvatar` and the agents query.
- The approve/deny dialogs are reused by `notifications` for inline enrolment actions.
