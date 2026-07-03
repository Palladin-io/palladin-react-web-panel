---
name: feedback-ef-order-before-projection
description: EF Core can't ORDER BY a property of a projected positional record — order on source columns before Select
metadata:
  type: feedback
---

In EF Core (Npgsql) queries, do NOT `.Select(x => new SomeRecord(...))` and then `.OrderBy(x => x.SomeProp)` — it throws `InvalidOperationException: could not be translated`.

**Why:** ordering over a positional-record projection isn't translatable; the translator needs the order keys to reference source entity columns.

**How to apply:** put `orderby e.Label, e.Id` (source columns) in the query BEFORE the `select new Record(...)`, then `.Take(limit).ToListAsync()`. Mirrors `SearchOrganizationEntries`. The vault search (`OrderBy(v => v.Name)` on a source entity before `Select`) was fine; only the projected-record ordering broke.
