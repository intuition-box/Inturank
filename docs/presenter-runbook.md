# Presenter runbook (demo without the build owner)

Use this when **you are not in the room**. Goal: **zero FUD** about data without over-claiming.

## The one sentence (say this if pressed)

**Intuition writes land on-chain when the user signs; IntuRank reads labels and lists through the normal Intuition indexer (GraphQL). There is no separate “fake graph,” but not every Arena contest uses the same query—badges say Curated vs Live graph vs On-chain list.**

“Everything is on-chain” for **reads** is misleading: explorers and apps **index** chain state. That is standard and not a dodge.

## Before the call (15 minutes)

- [ ] Same laptop/browser as rehearsal; **one** funded wallet on **Intuition (chain 1155)**.
- [ ] `.env.local` from `.env.example`; for Skill Playground, `VITE_GEMINI_API_KEY` set **only if** they will open Skill chat.
- [ ] `npm install && npm run dev` opens **`/`**; Arena is **`/#/climb`** (hash router).
- [ ] Open **`/#/climb`** → **Built on Intuition** → confirm cards load (real names, not empty). If empty: **do not panic**—see [If something breaks](#if-something-breaks).
- [ ] Connect wallet once; if prompted, **switch network** and accept **Fee proxy** when staking.

## 60-second flow (safe default)

1. **Arena** → `/#/climb` → pick **Built on Intuition** → skim **2–3 cards** (yes/no is fine without staking).
2. **Explain badges** on the card: **On-chain list** = membership from indexed list triples; not the same as “open claims” (different contest).
3. Optional: **one** wallet action (switch network + open conviction cart **or** skip if time is short).

## If something breaks

| Symptom | What to say (honest) |
|--------|----------------------|
| Empty pool / “Nothing loaded from the indexer” | “Indexer returned no rows or GraphQL env is wrong. We don’t inject fake cards on purpose.” Then open **`/#/climb`** → another contest (e.g. **Open claims (graph)**) or **Tools you’d bet your workflow on** (curated—say it’s intentional onboarding, not the live roster). |
| Wrong network / wallet won’t sign | “User cancelled or chain mismatch; queue is unchanged.” Retry switch from header. |
| Skill Playground errors | “Chat needs API keys in env; we can skip Skill and stay on Arena.” |

## Reference docs (paste in chat)

- **Arena data sourcing FAQ:** [`docs/demo.md`](demo.md) (section *Arena data sourcing*)
- **Full QA checklist:** [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- **Product phases / checklist:** [`services/intuRankProductSpec.ts`](../services/intuRankProductSpec.ts)

## What *not* to promise

- Do **not** say “the whole Arena is `getTopClaims`”—it isn’t; see FAQ.
- Do **not** imply **Curated** daily tools list is the canonical on-chain roster—it’s **labeled Curated** for a reason.

## Escalation

If the room needs a technical owner: **screen recording + `VITE_GRAPHQL_URL` + browser console**—not guesswork in front of Billy.
