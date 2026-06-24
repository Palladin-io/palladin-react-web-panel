---
name: fix-pr
description: Implementuje poprawki na podstawie komentarzy review — czyta nierozwiązane uwagi, modyfikuje kod, buduje, testuje, commituje, odpowiada na komentarze i resolvuje wątki.
argument-hint: <pr-number>
disable-model-invocation: true
allowed-tools: Read Write Edit Grep Glob Bash(gh pr *) Bash(gh api *) Bash(gh api graphql *) Bash(git *) Bash(npm *) Bash(jq *)
effort: high
---

# Fix PR — Palladin React Web Panel

## Kontekst PR

**Metadane:**
!`gh pr view $ARGUMENTS --json number,title,headRefName,baseRefName,author 2>/dev/null`

**Poprzednie review (REQUEST_CHANGES do naprawy):**
!`gh pr view $ARGUMENTS --json reviews 2>/dev/null`

**Komentarze inline:**
!`gh api repos/$(gh repo view --json nameWithOwner --jq '.nameWithOwner')/pulls/$ARGUMENTS/comments 2>/dev/null`

**Zmienione pliki:**
!`gh pr diff $ARGUMENTS --name-only 2>/dev/null`

---

## Jak przeprowadzić naprawę

### Krok 1 — przygotuj branch

Upewnij się że jesteś na właściwym branchu PR. Jeśli nie:
```bash
HEAD=$(gh pr view $ARGUMENTS --json headRefName --jq '.headRefName')
git fetch origin "$HEAD"
git checkout "$HEAD"
```

### Krok 2 — przeanalizuj komentarze

Przeczytaj wszystkie nierozwiązane komentarze z review (powyżej). Dla każdego:
- Zrozum problem — użyj `Read`, `Grep`, `Glob` żeby przejrzeć powiązany kod
- Ustal konkretną zmianę do wprowadzenia
- Jeśli komentarz jest niejasny — zaznacz to w odpowiedzi zamiast zgadywać

### Krok 3 — wprowadź poprawki

Edytuj pliki używając `Edit`. Przestrzegaj konwencji projektu (CLAUDE.md):
- Crypto wyłącznie w `src/shared/crypto/` — nigdy w feature hookach
- Klucze (MK, private key, VK) wyłącznie w Zustand w pamięci — nigdy localStorage
- TanStack Query dla stanu serwerowego, Zustand dla stanu klienta
- Wszystkie stringi przez `t('key')` — nigdy hardcoded
- TypeScript strict — brak `any`, używaj Zod dla API responses
- Hooki zawsze na górze komponentu — nigdy po warunkowych returnach

### Krok 4 — zbuduj i przetestuj

```bash
npm run build
npm test
```

Jeśli build lub testy nie przechodzą — napraw przed przejściem dalej. Nie commituj łamiącego buildu.

### Krok 5 — commituj

```bash
git add [konkretne pliki]
git commit -m "fix: [opis co naprawiono, odwołanie do review]"
git push
```

Commit message po polsku, zwięzły, opisuje efekt a nie mechanikę zmiany.

### Krok 6 — odpowiedz na każdy komentarz i resolvuj wątki

Dla każdego zaadresowanego komentarza:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# Odpowiedz na komentarz (COMMENT_ID = .id z listy komentarzy powyżej)
gh api "repos/${REPO}/pulls/$ARGUMENTS/comments/{COMMENT_ID}/replies" \
  --method POST \
  --field body="✅ Naprawione — [jednozdaniowy opis co zostało zrobione i gdzie]."

# Pobierz thread node IDs żeby je resolvować
gh api graphql -f query='
  query($owner:String!,$repo:String!,$pr:Int!) {
    repository(owner:$owner,name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:50) {
          nodes {
            id
            isResolved
            comments(first:1) { nodes { databaseId } }
          }
        }
      }
    }
  }
' -f owner="$(echo $REPO | cut -d/ -f1)" \
  -f repo="$(echo $REPO | cut -d/ -f2)" \
  -F pr=$ARGUMENTS

# Resolvuj wątek (THREAD_NODE_ID to .id z powyższego query)
gh api graphql \
  -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' \
  -f id="{THREAD_NODE_ID}"
```

Dla komentarzy których świadomie **nie naprawiasz** — odpowiedz z uzasadnieniem (nie resolvuj wątku).

### Krok 7 — podsumowanie na PR

Po obsłużeniu wszystkich komentarzy dodaj komentarz podsumowujący:

```bash
gh pr comment $ARGUMENTS --body "..."
```

Format:
```markdown
## 🔧 Fix PR — podsumowanie

### Naprawione
- `src/ścieżka/do/pliku.tsx:42` — co zostało zmienione (odpowiada na komentarz X)

### Świadomie pominięte
- [opis] — uzasadnienie

### Następne kroki
- [jeśli zostały nierozwiązane kwestie wymagające szerszej dyskusji]
```
