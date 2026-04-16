---
name: pr-review
description: Reviews a pull request in the Claw Vault React web panel for component consistency, TypeScript correctness, i18n, security, and frontend best practices. Posts findings as a structured GitHub PR comment.
argument-hint: <pr-number>
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr comment *) Bash(git log *)
effort: high
---

# PR Review — Claw Vault React Web Panel

## Pull Request Context

**Metadata:**
!`gh pr view $ARGUMENTS --json number,title,body,author,additions,deletions,changedFiles,baseRefName,headRefName 2>/dev/null || echo "PR metadata unavailable"`

**Changed files:**
!`gh pr diff $ARGUMENTS --name-only 2>/dev/null || echo "No changed files"`

**Diff (first 50 000 chars):**
!`gh pr diff $ARGUMENTS 2>/dev/null | head -c 50000`

---

## How to Conduct the Review

1. Read `CLAUDE.md` — it is the source of truth for all project conventions.
2. Load [criteria.md](criteria.md) — detailed review checklist. Read it fully before starting.
3. For each changed file: use `Read`, `Grep`, `Glob` to explore related files beyond the diff (e.g. locale files when new strings are added, shared components when UI changes are made, Zustand store when state is touched).
4. Cite **file path and line number** for every issue.
5. One clear sentence per finding.

## Review Focus Areas

Cover all sections from `criteria.md`:
- TypeScript: strict mode, no `any`, correct interface/type usage
- Component consistency: shared components, no inline style duplication, FormField
- i18n: locale JSON files, no hardcoded user-facing strings, both en + pl updated
- State management: TanStack Query for server state, Zustand for client state
- Security: crypto only in shared/crypto/, keys only in memory, no sensitive data in localStorage
- Analytics: format, UI-only events, no duplication with backend
- React patterns: hooks rules, functional components, effect cleanup, error boundaries
- Routing: TanStack Router file-based, type-safe routes
- Tests: co-located, coverage, no skipped tests
- Over-engineering check

## Output

Post the review as a GitHub PR comment:

```
gh pr comment $ARGUMENTS --body "REVIEW_BODY_HERE"
```

Use this Markdown structure:

```markdown
## 🔍 PR Review — React Web Panel

### Summary
2–3 sentences on what the PR does and your overall verdict.

### 🚨 Critical
*(must fix before merge — security issues, broken crypto boundaries, hardcoded secrets, sensitive data persistence)*
- `src/path/to/file.tsx:42` — explanation

### ⚠️ Warnings
*(should fix — hardcoded strings, wrong state layer, missing i18n, invalid hooks usage, missing disposal)*
- `src/path/to/file.tsx:17` — explanation

### 💡 Suggestions
*(non-blocking — clarity improvements, minor DRY, small convention deviations)*
- `src/path/to/file.tsx:8` — explanation

### ✅ Highlights
*(good patterns worth reinforcing)*
- what was done well
```

Omit any section that has no findings. Do not comment on formatting or import ordering.
