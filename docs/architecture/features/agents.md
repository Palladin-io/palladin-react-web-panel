# Feature: agents

**Path:** `src/features/agents/`

## What it does
Master/detail management of org agents. List on the left, agent detail (tabs: Overview / Grants / Logs) on the right. Approve/deny enrolment.

## Key components / hooks / queries
- Page: `agents-page.tsx` (split-view).
- `agent-list-panel.tsx` + `agent-card.tsx` (left), `agent-detail.tsx` (right, inline tab strip at `:133`).
- `agent-edit-form.tsx` — always-visible inline edit (`canEdit`-gated), footer at `:179`.
- `ApproveAgentDialog` / `DenyAgentDialog` — enrolment status transition (no client crypto; backend handles enrolment crypto).
- `AgentAvatar` — agent icon.
- Hook: `useAgents`.

## Patterns
- Split-view + inline tab strip (candidates for `SplitView` / `DetailTabBar`).
- `AgentCard` hover is inlined (`agent-card.tsx:39`) — should route through `HOVERABLE_CARD_CLASSES`.

## Cross-feature deps
- **`AgentCard` exported and reused** by `api-keys` (Agents tab) — the main card-level cross-feature reuse.
- `ApproveAgentDialog`/`DenyAgentDialog` reused by `notifications`.
- Exports `AgentAvatar`, `AgentCard`, `useAgents`.
