# Contributing to IntuRank Vanguard

General expectations: prefer small PRs, match existing naming and formatting, avoid committing secrets (`*.env*`, credentials). See the root **`README.md`** for install and routing notes.

---

## Demo checklist (release / UX regression)

Paste into an issue comment and tick **`[x]`** as you verify. Mirrors the narrative in **`docs/demo.md`** and milestone outcomes in **`services/intuRankProductSpec.ts`**.

### Arena honesty (no “all getTopClaims” claim)

- [ ] **Curated** daily contest is intentionally in-repo; don’t describe it as the live graph roster.
- [ ] **Graph** contests: rows come from GraphQL (`getTopClaims` **or** `fetchArenaLiveAtomsFromGraph`); **no placeholder deck** if the indexer is empty.
- [ ] **Portal / list** contests: roster + counts from list-membership queries (`getListMemberSubjectsForObject` / `countListMembersForObject`).

### Environment

- [ ] `npm install` and `npm run dev` succeed.
- [ ] `.env.local` present where needed (Gemini key for Skill Playground tests).

### Wallet and network (**graph writes rely on these**)

- [ ] Wallet connects on **Intuition** (**chain 1155** in this codebase).
- [ ] Wrong-network banner / switch action: either lands on **1155** **or** user cancel shows **friendly** toast, **not** ambiguous errors.
- [ ] FeeProxy / MultiVault **approval**: appears when needed; approving once unblocks subsequent writes.

### P0 Arena

- [ ] **`/#/climb`** onboarding path is understandable without jargon first.
- [ ] Conviction cart: queue → review → submit; wallet **reject** keeps queue (**info** toast).

### Signals (Pulse / Vouch)

- [ ] Pulse cart submit: cancel in wallet keeps queue (**info** toast).
- [ ] Vouch batch submit: same behavior.

### Skill Playground (optional smoke)

- [ ] **`/#/skill-playground`**: representative tx path to **broadcast** works when model returns valid intents.
- [ ] Cancellation in wallet = **clear rejected state**, not unexplained failures.

---

## Product direction

Arena checklist and phased roadmap snippets live beside product code in **`services/intuRankProductSpec.ts`** for quick PR context.
