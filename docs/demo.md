# IntuRank demo walkthrough

Hands-on QA path aligned with phased outcomes in [`services/intuRankProductSpec.ts`](../services/intuRankProductSpec.ts) (`PRODUCT_PHASES` **P0**–**P3**). Use this alongside the tick list in **[`CONTRIBUTING.md`](../CONTRIBUTING.md)** (`Demo checklist`) so reviewers (e.g. ZET) can sign off reproducibly.

**Router note:** The app uses a hash router (`/#/…`).

---

## Arena data sourcing (reviewer / Zet FAQ)

Do **not** tell people “everything is `getTopClaims`.” It depends on the contest:

| Source (badge) | Where rows come from |
|----------------|----------------------|
| **Curated** | In-app list for onboarding (not a chain mirror). |
| **Live graph** | Intuition GraphQL only: claims → `getTopClaims`; vault/identity scan → `fetchArenaLiveAtomsFromGraph` / `getAllAgents`. **No invented labels** if the indexer is empty (you’ll see an empty-state message). |
| **On-chain list** | Indexed list triples: **`getListMemberSubjectsForObject`** + **`countListMembersForObject`** for counts. |

- [ ] For **Built on Intuition**, confirm hub “N picks” tracks the **portal list** (indexed membership), not a hardcoded lineup.
- [ ] For **graph** contests, confirm you’re not claiming “mock” data: empty pool means **indexer returned nothing**, not a hidden fallback deck.

---

## Prerequisites

- [ ] **Build runs:** `npm install` → `npm run dev` → open URL Vite prints (often `http://localhost:5173`).
- [ ] **Env:** `.env.local` from `.env.example`; for Skill chat, set `VITE_GEMINI_API_KEY` when testing **Intel → Skill Playground**.
- [ ] **Wallet:** Funded account on **Intuition** with enough **TRUST** for gas plus any stakes you intend to broadcast.
- [ ] **Network:** Confirm the wallet switches to **Intuition** (**chain ID 1155** in this repo). If a switch prompt appears, accept it **or** use the header “wrong network” action; cancelling should **not** break the queued cart (Pulse or Arena)—only toast as cancelled.
- [ ] **Fee proxy:** First FeeProxy-heavy flow may ask for MultiVault approval; approve when you intend graph writes.

---

## P0 · Arena polish and comprehension

Goals: Time-to-first-pick, informal clarity on `/climb`, scroll depth.

- [ ] Open **`/#/climb`** (flagship onboarding: **`/#/climb?list=trust-your-tools&onboard=1`** or hub redirect **`/hub/trust-tools`**).
- [ ] As guest: understand pick affordances in **~one glance** (yes/no pattern, list context).
- [ ] Connect wallet; confirm header shows correct address on **1155**.
- [ ] Queue **Conviction cart** picks, open review, confirm copy reads as cart + submit (not ambiguous “batch only”).
- [ ] Submit: approve **network switch** (if prompted), proxy if needed, then **signature**; on **reject/cancel**, confirm an **info** toast (queue unchanged), not a harsh error storm.
- [ ] After success: confirm explorer / portfolio paths still make sense (`/markets/:id` reachable from surfaced items where expected).

---

## P1 · Hub: Arena → explain → stake

Goals: CTR from Arena toward markets/explain; wallet connects after engagement.

- [ ] Navigate **Arena → Markets / Explain** flows as a first-time user (no broken dead ends).
- [ ] From Pulse / Arena context, confirm there is an obvious route to deepen (market page, triple, or doc link).
- [ ] Disconnect / reconnect wallet and confirm Pulse or Arena submits still invoke **switch + verify chain** without silent failure on wrong network.

---

## P2 · Artifacts / share friction

Goals: Lightweight share loops (stance session URLs, polish later).

- [ ] Copy **`/#/climb?list=…`** (and optional `ref=graph`) link; reopen in a fresh tab and confirm landing list matches expectation.
- [ ] Note any regressions blocking “one link = same ladder” semantics.

---

## P3 · Graph serendipity

Goals: Neighboring triples / cross-market cues (mostly future-facing).

- [ ] Sanity check **Signals** Pulse / Crowd lanes load Hot / Crowd identities without infinite spinners.
- [ ] **Pulse cart:** Queue Support/Oppose, submit; on wallet **cancel**, cart should remain (**info** toast).
- [ ] **Vouch cart:** Same cancel vs success behavior as Pulse.

---

## Skill Playground (`/#/skill-playground`)

Goals: Unsigned intents → **Sign & broadcast** reliably; rejects are non-scary.

- [ ] With `VITE_GEMINI_API_KEY`, send a minimal prompt that returns a valid **FeeProxy-compatible** `{ to, data, value }` (or use triple-from-labels path).
- [ ] Exercise **Approve proxy** flow once; replay should be cached/smooth where applicable.
- [ ] Cancel a signature early: assistant row should show **rejected**, toast **info**, not a generic explosion.

---

## Graph writes sanity (what “landed” means)

- Successful Arena / Pulse **submits** produce **transaction hashes**; subgraph / portfolio indexing may **lag**.
- Queues (**Arena picks**, **Pulse stances**, **Vouches**) are **local-first** until an on-chain confirmation path completes; cancelling a wallet prompt should **preserve** queued rows.
