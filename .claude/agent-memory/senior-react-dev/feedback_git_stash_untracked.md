---
name: feedback-git-stash-untracked
description: Never use plain `git stash` when new untracked files are in play — use `-u`, or commit early before switching branches
metadata:
  type: feedback
---

Gdy przełączasz gałęzie z niezacommitowaną pracą zawierającą **nowe (untracked) pliki**, NIE używaj zwykłego `git stash`.

**Why:** Plain `git stash` pomija untracked pliki — przepadają z working tree i nie ma ich w stashu. W sesji multi-branch (CVT-54 + CVT-57) groziło to utratą całego nowego feature'a (envelope crypto, hooki, dialogi). User potraktował to jako utratę danych wysokiego priorytetu.

**How to apply:**
- Najbezpieczniej: **commituj wcześnie** (nawet WIP `[skip ci]`) zanim przełączysz gałąź — lokalny commit zabezpiecza pracę.
- Jeśli musisz stashować z nowymi plikami: ZAWSZE `git stash push -u` (lub `-a`). Bez `-u` untracked giną.
- Alternatywnie `git add -A` przed przełączeniem.
- Przy izolacji prac na osobnych gałęziach (jedna gałąź = jeden task): pilnuj że pliki trafiają na właściwą gałąź; po `stash pop` zweryfikuj `git status` i `ls` że WSZYSTKIE oczekiwane pliki wróciły (tracked + untracked).
