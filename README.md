# IntuRank Vanguard

IntuRank is a web client for exploring and interacting with the [Intuition](https://docs.intuition.systems) trust graph: markets, portfolio, claims, stats, and tooling built with **React**, **Vite**, **wagmi/viem**, and the Intuition GraphQL API.

## Development

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The app uses a **HashRouter**, so routes look like `/#/markets`, `/#/skill-playground`, etc.

### Environment

Copy `.env.example` to `.env.local` and set values as needed:

| Variable | Purpose |
|----------|---------|
| `VITE_GEMINI_API_KEY` | Powers the **Intuition Skill Playground** chat (Gemini). Comma-separated keys are supported; one is chosen at random per request. |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect (mobile / QR). |
| `VITE_GRAPHQL_URL` | Production GraphQL endpoint. In dev, leave unset so `/v1/graphql` is proxied by Vite. |
| Others in `.env.example` | IPFS uploads, email hooks, maintenance mode, etc. |

**Intuition Skill Playground:** With a connected wallet on **Intuition Mainnet (chain 1155)** and `VITE_GEMINI_API_KEY` set, open **Intel → Skill Playground** or go to `/#/skill-playground`. The in-app agent proposes unsigned transactions (`to`, `data`, `value`); you review and **Sign & Broadcast** through your wallet—the same pattern as the CLI Skill workflow below.

### Product roadmap (Arena and trust funnels)

Phased priorities (outcomes × metrics) and the Arena UX checklist live in [`services/intuRankProductSpec.ts`](services/intuRankProductSpec.ts). **Trust picks** open in the Arena at **`/#/climb?list=trust-your-tools&onboard=1`** (`/hub/trust-tools` redirects there so the flow stays on one page). Arena share URLs use **`/#/climb?list=<id>`** (`listId` still accepted as an alias). Optional return nudge: **`ref=graph`** on the same URL.

**What syncs where (today):** positions, atoms, triples, and TRUST you put through the protocol live **on-chain / in the indexer**. Some IntuRank UX (Arena batch queue before submit, starred list IDs, skill chat history, activity XP ledger) still uses **browser storage** so it does not follow the user across devices until we add a backend or move more state on-chain.

---

# Intuition Skill Tutorial

> **Give your AI agent shared, verifiable onchain memory in ~10 minutes.**

This tutorial explains how to use the **Intuition Skill** to generate correct-by-construction transaction parameters for the Intuition Protocol, then execute them (e.g. with **viem** or the **IntuRank** wallet flow).

---

## What You'll Learn

- How to install and use the **Intuition Skill** in your AI coding agent (Cursor, Claude Code, etc.)
- How to create **Atoms** (identities/concepts) on Intuition
- How to create **Triples** (structured claims) linking Atoms
- How to deposit **TRUST** into vaults to stake on claims
- How to bridge: **Skill output → viem → blockchain** (or **Skill output → IntuRank Sign & Broadcast**)

---

## Prerequisites

- **Node.js 20+** installed
- A **funded demo wallet** on Intuition Mainnet (get TRUST from faucet or bridge)
- An **AI coding agent** that supports `npx skills`:
  - Cursor (recommended)
  - Claude Code
  - Codex
  - Or any agent compatible with the Skills protocol

---

## Quick Start

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Install the Intuition Skill (for your coding agent)

This teaches your agent the correct Intuition Protocol ABIs, calldata encoding, and `msg.value` calculations:

```bash
npx skills add 0xintuition/agent-skills --skill intuition
```

**What this does:** Your agent understands:

- Correct contract addresses (MultiVault, FeeProxy)
- Proper calldata encoding for `createAtoms`, `createTriples`, `deposit`, `redeem`
- Exact `msg.value` calculations (deposit + fees)
- GraphQL query patterns
- IPFS metadata flows

### Step 3: Set Up Environment

```bash
cp .env.example .env.local
```

For **local scripts** or tools that sign with a private key (not used by the default IntuRank UI), you may set:

```bash
INTUITION_RPC_URL=https://rpc.intuition.systems/http
INTUITION_CHAIN_ID=1155
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

> **Security:** Never commit `.env.local` or real keys. Use a test wallet with minimal funds.

For **IntuRank in the browser**, configure `VITE_GEMINI_API_KEY` and connect a wallet; broadcasting uses the wallet, not `PRIVATE_KEY`.

### Step 4: Run the App

```bash
npm run dev
```

Use the **Skill Playground** in the sidebar (Intel menu) for a ready-made agent UI, or integrate the same `{ to, data, value, chainId }` pattern in your own code.

---

## How Each Example Works (agent / CLI pattern)

The standalone tutorial repo uses small TypeScript files under `src/examples/`. **IntuRank** implements the same contract pattern in-app: the Skill Agent outputs JSON; **Sign & Broadcast** sends it via viem through your connected wallet.

### Example 1: Create an Atom

**What it does:** Creates a new identity/concept on Intuition (e.g., "Ethereum", "Alice", "Design").

**Workflow:**

1. **Ask the Skill** (in your AI agent chat):

   ```
   /intuition --write createAtoms "My First Atom" --deposit 0.01 --network mainnet
   ```

2. **Copy the Skill's output** (JSON like):

   ```json
   {
     "to": "0xCbFe767E67d04fBD58f8e3b721b8d07a73D16c93",
     "data": "0x1234abcd...",
     "value": "10000000000000000",
     "chainId": "1155"
   }
   ```

3. **In IntuRank:** paste the same intent into the **Skill Playground** chat, or paste parameters into your own viem `sendTransaction` call.

4. **In a script:** set `unsignedTx` from the Skill output and broadcast with your wallet client.

**Expected result:** a transaction hash on [Intuition Explorer](https://explorer.intuition.systems).

---

### Example 2: Create a Triple

**What it does:** Creates a structured claim linking three Atoms (Subject → Predicate → Object).

**Example:** "Alice is skilled in Design"

- **Subject:** `Alice` (Atom ID)
- **Predicate:** `is skilled in` (Atom ID)
- **Object:** `Design` (Atom ID)

**Workflow:**

1. Create or resolve the three Atom IDs (Example 1 or GraphQL).

2. **Ask the Skill:**

   ```
   /intuition --write createTriples <subjectId> <predicateId> <objectId> --deposit 0.1 --network mainnet
   ```

3. Execute via Skill output + viem, or use the **Skill Playground** with a natural-language request that includes the three term IDs.

---

### Example 3: Deposit into a Vault

**What it does:** Stakes TRUST into an Atom or Triple vault.

1. Get a `termId` (Atom or Triple ID).

2. **Ask the Skill:**

   ```
   /intuition --write deposit <termId> 0.1 --network mainnet
   ```

3. Paste Skill output into your executor or confirm in the Playground when the agent proposes the transaction.

---

## The Complete Workflow

```
┌─────────────────┐
│  AI Agent       │
│  (Cursor/Claude)│
└────────┬────────┘
         │
         │ /intuition --write createAtoms ...
         │
         ▼
┌─────────────────┐
│  Intuition Skill│
│  (generates tx) │
└────────┬────────┘
         │
         │ Returns: { to, data, value, chainId }
         │
         ▼
┌─────────────────┐
│  Your Code or   │
│  IntuRank UI    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  viem / wallet  │
│  (signs & sends)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Intuition L3   │
└─────────────────┘
```

---

## Testing Without Broadcasting

In **IntuRank**, review the **Proposed Transaction** block before clicking **Sign & Broadcast**. You can also ask the agent to explain parameters without sending.

For scripts, keep broadcast lines commented until you are ready to spend gas.

---

## Understanding Skill Output

The Skill returns **unsigned transaction parameters**:

- **`to`**: Contract address (MultiVault or FeeProxy)
- **`data`**: Encoded calldata (function selector + args)
- **`value`**: TRUST amount in wei (as base-10 string)
- **`chainId`**: Intuition chain ID (**1155** for mainnet)

**Why this design?**

- The agent handles correctness (ABI, calldata, values)
- Your code or wallet handles execution (signing, broadcasting)
- Separation of concerns supports safer autonomous agents

---

## Troubleshooting

### "VITE_GEMINI_API_KEY is missing" in the Playground

- Set `VITE_GEMINI_API_KEY` in `.env.local` and restart `npm run dev`.

### Error: "Invalid chain"

- Verify the wallet is on Intuition Mainnet (**1155**).
- Use the in-app network switch if prompted.

### Error: "Insufficient funds"

- You need TRUST on Intuition Mainnet for gas and deposits.

### Skill not responding in Cursor

- Run: `npx skills add 0xintuition/agent-skills --skill intuition`
- Restart the editor.

---

## Next Steps

1. **Explore GraphQL**: `https://mainnet.intuition.sh/v1/graphql`
2. **Batch operations**: combine multiple atoms/triples where the protocol allows
3. **Share feedback** as a Dev Ambassador

---

## Resources

- **Intuition Protocol Docs**: https://docs.intuition.systems
- **Intuition Skill Repo**: https://github.com/0xIntuition/agent-skills
- **Intuition Explorer**: https://explorer.intuition.systems
- **GraphQL Endpoint**: https://mainnet.intuition.sh/v1/graphql

---

**Built by Intuition Dev Ambassadors**
