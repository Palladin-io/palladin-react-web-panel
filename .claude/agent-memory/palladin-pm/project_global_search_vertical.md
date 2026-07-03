---
name: project-global-search-vertical
description: Dashboard global search vertical (CVT-183/184/185) — cross-module autocomplete, ZK-safe plaintext metadata only
metadata:
  type: project
---

Global dashboard search jako osobny wertykał, decyzja usera 2026-06-29. Parent: CVT-12 „Dashboard Overview" (Phase 1 — Core). Subtaski (per-powierzchnia, Medium):
- **CVT-183** [Backend] `GET /api/search?q=` cross-module (Vault: vaulty + entry po Label/Description/UrlDomain; Agents: po nazwie). Zwraca typowane pogrupowane `{type: agent|vault|entry, id, name, vaultName?, icon?}`.
- **CVT-184** [Frontend] autocomplete dropdown z badge/ikoną typu, blokowany przez CVT-183.
- **CVT-185** [Mobile] odpowiednik Flutter, blokowany przez CVT-183, related CVT-184.

**Why:** Search w nagłówku dashboardu był już w AC CVT-12; user zdecydował zrobić go teraz jako pełny wertykał (backend→fe/mb).

**How to apply:** Kluczowe constrainty do utrzymania przy refinemencie/implementacji:
- Search WYŁĄCZNIE po plaintext metadata (Vault.Name, Entry.Label/Description/UrlDomain, nazwa agenta). NIGDY po `EntryContent` (ZK — serwer nie widzi sekretu).
- Agregacja cross-module bez circular-dep wzorcem `IOnboardingStepsProvider`/`IAgentOnboardingQuery` z [[project_wip_entry_detail_grant_integrity]] CVT-112 (interfejs query per moduł + jeden composer).
- Każdy wynik oznaczony typem (badge/ikona) agent/vault/entry.
