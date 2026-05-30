import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    Terminal,
    Send,
    Loader2,
    CheckCircle2,
    Zap,
    User,
    Bot,
    XCircle,
    ExternalLink,
    ShieldCheck,
    Layers,
    ChevronsDown,
    AlertTriangle,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { getAddress, isAddress, isHex, parseEther } from 'viem';
import {
  broadcastTransaction,
  intuitionChain,
  switchNetwork,
  getProxyApprovalStatus,
  grantProxyApproval,
  hasCachedProxyApproval,
  markProxyApproved,
  parseProtocolError,
  preflightSkillBroadcast,
  buildCreateAtomTxIntent,
  normalizeAtomLabel,
  stripMarkdownInlineDecorators,
  getAtomTermIdFromTxHash,
  getTripleTermIdFromTxHash,
  createTripleFromLabels,
  looksLikeBytes32TermId,
  inferFeeProxyActionFromCalldata,
} from '../services/web3';
import {
    CURRENCY_SYMBOL,
    FEE_PROXY_ADDRESS,
    MULTI_VAULT_ADDRESS,
    getGeminiApiKey,
    getGroqApiKey,
    getOpenAiApiKey,
    CHAIN_ID,
    NETWORK_NAME,
} from '../constants';
import { INTUITION_SKILL_FULL_SYSTEM_PROMPT } from '../services/intuitionSkillPrompt';
import { generateSkillChatCompletion, formatSkillLlmError } from '../services/skillLlm';
import {
  parseSkillTxJsonBlock,
  resolveJsonBodyFromAssistantResponse,
  extractFirstTopLevelJsonObject,
  formatSkillJsonForDisplay,
} from '../services/skillTxJson';
import { maybeFetchSkillLiveContext } from '../services/skillLiveContext';
import { buildSkillWriteRoutingAppendix } from '../services/skillUserIntentRouting';
import { logSkillEvent } from '../services/skillTelemetry';
import { toast } from './Toast';
import { playClick, playHover } from '../services/audio';
import { notifyProtocolXpEarned } from '../services/protocolXp';

type TxBroadcastOutcome = 'pending' | 'success' | 'rejected' | 'failed';

interface Message {
    /** Stable key for list animations & persistence (added v2). */
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** Which backend answered this assistant message (Skill: Groq → Gemini → OpenAI). */
    llmProvider?: 'gemini' | 'groq' | 'openai';
    txIntent?: any;
    txOutcome?: TxBroadcastOutcome;
    txHash?: string;
    txError?: string;
    /** Market / claim detail: atom or triple term id */
    txTermId?: string;
    /** Extra atom txs when running createTripleFromLabels */
    txAtomHashes?: string[];
    /** Shown when JSON looked like a tx but cannot be signed (e.g. shell placeholders). */
    txBlockedReason?: string;
}

function newSkillMessageId(): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        /* ignore */
    }
    return `skill-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isUserRejectionError(err: unknown): boolean {
    const e = err as { code?: number | string; cause?: { code?: number }; message?: string; shortMessage?: string };
    const code = e?.code ?? e?.cause?.code;
    if (code === 4001 || code === 'ACTION_REJECTED') return true;
    const s = `${e?.message ?? ''} ${e?.shortMessage ?? ''}`.toLowerCase();
    return /user reject|rejected|denied|cancel|cancelled|4001|action_rejected|user denied|request rejected|wallet.*reject|rejected the request/i.test(s);
}

/** GraphQL or prose was fenced as ```json — do not run JSON5 tx parser (avoids false "Could not build transaction" on read-only answers). */
function looksLikeGraphQLFencedAsJson(raw: string): boolean {
    const s = raw.trim();
    if (s.startsWith('{')) return false;
    return /^(query|mutation|subscription)\b/i.test(s) || /^query\s+\w/i.test(s);
}

/** Only show parse/build errors to the user when the block was meant as a Sign & broadcast intent. */
function looksLikeIntuRankTxIntentJson(raw: string): boolean {
    const s = raw.trim();
    if (!s.startsWith('{')) return false;
    return (
        /"action"\s*:\s*"(createAtom|createTriple)"/.test(s) ||
        (/"to"\s*:/.test(s) && /"data"\s*:/.test(s) && /"(0x)?[0-9a-fA-F]{40}"/.test(s))
    );
}

/** e.g. createTriple, create_triple, CreateTriple → createtriple */
function normalizeSkillAction(raw: unknown): string {
    return String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/[-_\s]/g, '');
}

/** Upstream skill docs use `operation`; models sometimes omit `action` on raw { to, data, value } blocks. */
function coalesceActionFields(parsed: Record<string, unknown>): unknown {
    for (const key of ['action', 'operation', 'type'] as const) {
        const v = parsed[key];
        if (v == null) continue;
        if (String(v).trim() === '') continue;
        return v;
    }
    return undefined;
}

function isTripleFromLabelsIntent(intent: { action?: unknown } | null | undefined): boolean {
    if (!intent || typeof intent !== 'object') return false;
    return normalizeSkillAction(coalesceActionFields(intent as Record<string, unknown>)) === 'triplefromlabels';
}

/**
 * Canonical action string for preflight, proxy approval, XP, and review labels.
 * Fills missing `action` when FeeProxy calldata is present.
 */
function resolveSkillTxAction(intent: Record<string, unknown> | null | undefined): string {
    if (!intent) return '';
    const raw = String(coalesceActionFields(intent) ?? '').trim();
    if (raw) {
        const n = normalizeSkillAction(raw);
        if (n === 'createatom' || n === 'createatoms') return 'createAtoms';
        if (n === 'createtriple') return 'createTriple';
        if (n === 'createtriples') return 'createTriples';
        if (n === 'deposit') return 'deposit';
        if (n === 'triplefromlabels') return 'tripleFromLabels';
        return raw;
    }
    const to = intent.to;
    const data = intent.data;
    if (typeof to === 'string' && typeof data === 'string' && isAddress(to) && isHex(data)) {
        if (to.toLowerCase() === FEE_PROXY_ADDRESS.toLowerCase()) {
            const inf = inferFeeProxyActionFromCalldata(data);
            if (inf) return inf;
        }
    }
    return '';
}

function skillTxActionDisplayLabel(intent: Record<string, unknown> | null | undefined): string {
    if (!intent) return 'Protocol transaction';
    if (isTripleFromLabelsIntent(intent)) return 'Triple (claim)';
    const a = resolveSkillTxAction(intent);
    if (a === 'createAtoms') return 'Create atom(s)';
    if (a === 'createTriples') return 'Create claim(s)';
    if (a === 'deposit') return 'Vault deposit';
    if (a === 'tripleFromLabels') return 'Triple (claim)';
    if (a) return a;
    return 'Protocol transaction';
}

/** Merge parsed JSON so UI / executeTx always see a stable `action` when inferrable. */
function enrichTxIntentFromParsed(parsed: Record<string, unknown>): Record<string, unknown> {
    const base = { ...parsed };
    const hasExplicit = coalesceActionFields(base) != null;
    if (!hasExplicit) {
        const to = base.to;
        const data = base.data;
        if (typeof to === 'string' && typeof data === 'string' && isAddress(to) && isHex(data)) {
            if (to.toLowerCase() === FEE_PROXY_ADDRESS.toLowerCase()) {
                const inf = inferFeeProxyActionFromCalldata(data);
                if (inf) return { ...base, action: inf };
            }
        }
        return base;
    }
    const canonical = resolveSkillTxAction(base);
    if (canonical && String(base.action ?? '').trim() !== canonical) {
        return { ...base, action: canonical };
    }
    return base;
}

/** LLMs echo shell tutorials with `<calldata>` or MultiVault `to` — unusable for Sign & broadcast. */
function skillCalldataInvalidReason(data: string): string | null {
    const s = data.trim();
    if (!s.startsWith('0x')) return '`data` must be hex starting with 0x (not a shell placeholder).';
    if (/[<>`]/.test(s)) {
        return '`data` still contains template characters. Use the **`createAtom`** / **`createTriple`** JSON from the IntuRank instructions (real hex only for advanced FeeProxy `to`/`data`).';
    }
    if (!isHex(s)) return '`data` is not valid hexadecimal calldata.';
    if (s.length < 10) return '`data` is too short to be contract calldata.';
    const nibbles = s.slice(2);
    if (nibbles.length % 2 !== 0) return '`data` hex has odd length (incomplete bytes).';
    return null;
}

/**
 * Raw `{ to, data, value }` from the model — reject before showing a misleading review card.
 */
function getRawSkillBroadcastValidationError(intent: Record<string, unknown>): string | null {
    if (intent.txBuiltIn) return null;
    if (isTripleFromLabelsIntent(intent)) return null;

    const toRaw = intent.to;
    const dataRaw = intent.data;
    const hasTo = typeof toRaw === 'string' && toRaw.trim() !== '';
    const hasData = typeof dataRaw === 'string' && dataRaw.trim() !== '';
    const hasValue = intent.value != null && String(intent.value).trim() !== '';

    if (!hasTo && !hasData && !hasValue) return null;

    if (hasValue && (!hasTo || !hasData)) {
        return 'Transaction JSON has `value` but is missing a valid `to` address or `data` hex.';
    }
    if ((hasTo && !hasData) || (!hasTo && hasData)) {
        return 'Transaction JSON needs both `to` and `data` for Sign & broadcast.';
    }

    const to = String(toRaw).trim();
    const data = String(dataRaw).trim();
    if (!isAddress(to)) return '`to` is not a valid checksummable address.';

    const chainRaw = intent.chainId;
    if (chainRaw != null && String(chainRaw).trim() !== '') {
        const cid = parseInt(String(chainRaw), 10);
        if (!Number.isNaN(cid) && cid !== CHAIN_ID) {
            return `JSON chainId is ${cid}; this app only signs chain ${CHAIN_ID}.`;
        }
    }

    const calldataErr = skillCalldataInvalidReason(data);
    if (calldataErr) return calldataErr;

    if (to.toLowerCase() === MULTI_VAULT_ADDRESS.toLowerCase()) {
        return (
            'This JSON targets **MultiVault** directly. IntuRank signs **FeeProxy** transactions. Ask for a `createAtom` JSON ' +
            '(name + `depositTrust`: **' +
            String(CHAIN_ID) +
            '**) — not shell/`cast` steps or MultiVault `to` — or a complete FeeProxy `to` from the network section of the prompt.'
        );
    }

    return null;
}

/**
 * Models paste upstream shell walkthroughs into ```json — $MULTIVAULT, 0x$CALLDATA, $(echo …).
 * That is never signable; catch it before we silently omit the review card.
 */
function skillJsonFenceLooksLikeShellTutorial(rawFenceInner: string): boolean {
    const s = rawFenceInner.trim();
    if (/\$\([a-zA-Z]/.test(s)) return true;
    if (/\$MULTIVAULT|\$CALLDATA|\$VALUE|\$ATOM|\$DEPOSIT|\$CURVE|\$RPC|\$GRAPHQL|\$IPFS|\$URI/i.test(s)) return true;
    if (/:\s*"\$\{/.test(s)) return true;
    if (/0x\$/.test(s)) return true;
    if (/"\$[A-Za-z_]/.test(s)) return true;
    if (/<calldata|<callData|0x<\w/i.test(s)) return true;
    return false;
}

function parsedRecordLooksLikeShellTemplate(parsed: Record<string, unknown>): boolean {
    const blob = ['to', 'data', 'value']
        .map((k) => (parsed[k] == null ? '' : String(parsed[k])))
        .join('\n');
    if (!blob.trim()) return false;
    if (/\$[A-Za-z_][A-Za-z0-9_]*|\$\(/.test(blob)) return true;
    if (/<calldata|<callData|0x</i.test(blob)) return true;
    return false;
}

/** Triple vault deposit — matches protocol prompt; LLMs often hallucinate "10". */
const DEFAULT_TRIPLE_DEPOSIT_TRUST = '0.5';

function normalizeTripleDepositTrust(raw: unknown): string {
    const s = String(raw ?? '').trim();
    if (!s) return DEFAULT_TRIPLE_DEPOSIT_TRUST;
    if (s === '10' || s === '10.0') return DEFAULT_TRIPLE_DEPOSIT_TRUST;
    return s;
}

/** Explains how subject/predicate/object are resolved — matches web3 resolveAtomReferenceToTermId. */
function tripleUiResolutionLine(subject: string, predicate: string, object: string): string {
    const n = [subject, predicate, object].filter((x) => looksLikeBytes32TermId(x)).length;
    if (n === 3) {
        return 'All three are term IDs — existing on-chain atoms are reused for them (no new atom transactions for those values).';
    }
    if (n > 0) {
        return 'Hex term IDs use existing atoms on-chain when present; plain-text labels only create atoms if that name does not exist yet.';
    }
    return 'Text labels: missing atoms are created first when needed, then the triple (one wallet prompt per new atom).';
}

/** Prefer first non-empty string among keys (LLMs use subject vs subjectId, etc.). */
function strFromParsed(parsed: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
        const v = parsed[k];
        if (v == null) continue;
        const s = stripMarkdownInlineDecorators(String(v).trim());
        if (s !== '') return s;
    }
    return '';
}

/** If the model echoed template text instead of a real atom name, do not offer Sign & broadcast. */
function isPlaceholderAtomLabel(label: string): boolean {
    const s = label.trim().toLowerCase();
    if (!s) return true;
    if (s.includes('placeholder')) return true;
    const bad = new Set([
        'your atom name',
        'human-readable name for the atom',
        'human-readable name',
        'use the user\'s exact chosen name here, not a placeholder',
        'example',
        'tbd',
        'my atom',
        'test',
        'atom name',
        'label',
    ]);
    return bad.has(s);
}

/** Bad JSON still looks like an atom-creation tutorial (MultiVault / &lt;calldata&gt; / shell) — safe to try createAtom rescue. */
function looksLikeFailedAtomTutorial(parsed: Record<string, unknown>, rawJsonFence: string): boolean {
    const act = normalizeSkillAction(coalesceActionFields(parsed));
    if (act === 'createtriple' || act === 'triplefromlabels') return false;
    if (skillJsonFenceLooksLikeShellTutorial(rawJsonFence) || parsedRecordLooksLikeShellTemplate(parsed)) return true;
    const data = String(parsed.data ?? '');
    const to = String(parsed.to ?? '').trim().toLowerCase();
    if (to === MULTI_VAULT_ADDRESS.toLowerCase() && data.trim() !== '') return true;
    if (/<calldata|<callData/i.test(data)) return true;
    if (/0x</i.test(data) && /[^0-9a-f\s]/i.test(data.replace(/^0x/i, ''))) return true;
    return false;
}

function extractLikelyAtomLabelForRescue(userMsg: string, responseText: string, parsed: Record<string, unknown>): string | null {
    const direct = strFromParsed(parsed, 'label', 'atomLabel', 'name', 'title');
    if (!isPlaceholderAtomLabel(direct)) return direct.trim();

    const pinName = responseText.match(/"name"\s*:\s*"([^"]{1,120})"/);
    if (pinName?.[1] && !isPlaceholderAtomLabel(pinName[1])) return stripMarkdownInlineDecorators(pinName[1].trim());

    const named = responseText.match(/(?:named|called)\s+["']([^"']{2,120})["']/i);
    if (named?.[1] && !isPlaceholderAtomLabel(named[1])) return stripMarkdownInlineDecorators(named[1].trim());

    const headline = responseText.match(/(?:atom|entity)\s*[:(]?\s*["']([^"']{2,120})["']/i);
    if (headline?.[1] && !isPlaceholderAtomLabel(headline[1])) return stripMarkdownInlineDecorators(headline[1].trim());

    const colonTitle = responseText.match(/(?:creating\s+an?\s+atom|atom)\s*:\s*["']([^"']{2,120})["']/i);
    if (colonTitle?.[1] && !isPlaceholderAtomLabel(colonTitle[1])) return stripMarkdownInlineDecorators(colonTitle[1].trim());

    const firstLine = userMsg.split('\n')[0]?.trim() ?? userMsg;
    const um = firstLine.match(
        /(?:create|add|mint|make)\s+(?:an?\s+)?atom(?:\s+called|\s+named)?\s*[,:]?\s*["']?([^"'\n,]{2,80})/i,
    );
    if (um?.[1] && !isPlaceholderAtomLabel(um[1].trim())) return stripMarkdownInlineDecorators(um[1].trim());

    const q = firstLine.match(/^["']([^"']{2,80})["']\s*$/);
    if (q?.[1] && !isPlaceholderAtomLabel(q[1])) return stripMarkdownInlineDecorators(q[1].trim());

    return null;
}

function rescueDepositTrust(parsed: Record<string, unknown>, responseText: string): string {
    const raw = strFromParsed(parsed, 'depositTrust', 'deposit');
    if (raw && /^\d*\.?\d+$/.test(raw)) {
        const n = Number.parseFloat(raw);
        if (n >= 0.5 && n <= 1e6) return raw;
    }
    const m = responseText.match(/(\d+\.?\d*)\s*(?:TRUST|₸|〒)/i);
    if (m && Number.parseFloat(m[1]) >= 0.5) return m[1];
    return '0.5';
}

async function tryRescueBuiltInCreateAtomAfterBadSkillJson(
    wallet: string,
    userMsg: string,
    responseText: string,
    rawJsonFence: string,
    parsed: Record<string, unknown>,
): Promise<{ intent: Record<string, unknown>; note: string } | null> {
    if (!looksLikeFailedAtomTutorial(parsed, rawJsonFence)) return null;
    const labelRaw = extractLikelyAtomLabelForRescue(userMsg, responseText, parsed);
    if (!labelRaw) return null;
    const depositTrust = rescueDepositTrust(parsed, responseText);
    try {
        const built = await buildCreateAtomTxIntent(wallet, labelRaw, depositTrust);
        const onChainName = normalizeAtomLabel(labelRaw);
        logSkillEvent({
            level: 'info',
            event: 'skill.chat.tx_intent_rescued_create_atom',
            detail: { label_len: onChainName.length },
        });
        return {
            intent: {
                action: 'createAtoms',
                to: built.to,
                data: built.data,
                value: built.valueWei.toString(),
                chainId: String(CHAIN_ID),
                description: `Create atom "${onChainName}"`,
                txBuiltIn: true,
                builtinLabel: onChainName,
                builtinDepositTrust: depositTrust,
                builtinDataHex: built.dataHex,
            },
            note: '\n\n_(**Sign & broadcast** below uses IntuRank’s real **`createAtom`** encoding. The JSON in the reply was a non-executable template.)_',
        };
    } catch {
        return null;
    }
}

function extractErrorText(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
        const e = error as Record<string, unknown>;
        if (typeof e.message === 'string') return e.message;
        const nested = e.error;
        if (nested && typeof nested === 'object' && nested !== null && 'message' in nested) {
            return String((nested as { message?: string }).message ?? '');
        }
    }
    return String(error ?? '');
}

type SkillChatProps = {
    /** e.g. playground uses viewport height; default fills parent */
    className?: string;
};

const SKILL_CHAT_STORAGE_KEY = 'inturank_skill_chat_v1';
/** Cap persisted history to keep localStorage small and snappy */
const SKILL_CHAT_MAX_MESSAGES = 48;

const DEFAULT_SKILL_MESSAGES: Message[] = [
    {
        id: 'skill-seed-welcome',
        role: 'assistant',
        content:
            "Hi. I run on the full upstream Intuition skill package (SKILL.md, GraphQL reference, schemas, workflows, deposit/redeem batch ops, simulation, fees) plus IntuRank-specific routing. Ask deep protocol questions or tell me what to create (atom or a claim like “Alice / trusts / Bob” with a 0.5 TRUST deposit). I reply in your language when I can. Connect your wallet when you are ready to Sign & broadcast. Before your first on-chain create, use Enable fee proxy in the bar if it appears (one time).",
    },
];

const SKILL_MD_COMPONENTS = {
    p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mb-2 last:mb-0 text-[13px] text-slate-300 leading-[1.65]">{children}</p>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic text-slate-200">{children}</em>,
    ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="my-2 pl-4 list-disc space-y-1 [overflow-wrap:anywhere]">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="my-2 pl-4 list-decimal space-y-1 [overflow-wrap:anywhere]">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
            href={href}
            className="text-intuition-primary hover:underline break-all"
            target="_blank"
            rel="noreferrer"
        >
            {children}
        </a>
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
        <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 my-2 text-[11px] font-mono text-slate-200 border border-white/10">
            {children}
        </pre>
    ),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
        const block = Boolean(className?.includes('language-'));
        if (block) {
            return <code className={className}>{children}</code>;
        }
        return (
            <code className="rounded bg-black/40 px-1 py-0.5 text-[11px] font-mono text-cyan-200/90">{children}</code>
        );
    },
    h1: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-sm font-bold text-white mt-3 mb-1 first:mt-0">{children}</h3>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-sm font-bold text-white mt-3 mb-1 first:mt-0">{children}</h3>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-sm font-bold text-white mt-3 mb-1 first:mt-0">{children}</h3>
    ),
};

function MarkdownSegment({ text }: { text: string }) {
    const t = text.trim();
    if (!t) return null;
    return (
        <div className="[overflow-wrap:anywhere]">
            <ReactMarkdown components={SKILL_MD_COMPONENTS as any}>{text}</ReactMarkdown>
        </div>
    );
}

/** Keeps chat readable: raw JSON from the model lives in a disclosure instead of inline. */
function AssistantMessageBody({ content }: { content: string }) {
    const parts: React.ReactNode[] = [];
    let last = 0;
    /** Tolerates ``` json`, ```JSON`, spaces; empty fences get JSON from below the block or from the message. */
    const re = /```\s*json\s*([\s\S]*?)```/gi;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(content)) !== null) {
        if (m.index > last) {
            parts.push(<MarkdownSegment key={key++} text={content.slice(last, m.index)} />);
        }
        const resolved = resolveJsonBodyFromAssistantResponse(content, m);
        const display = resolved ? formatSkillJsonForDisplay(resolved) : '';
        parts.push(
            <details
                key={key++}
                open
                className="mt-3 rounded-2xl border border-white/[0.09] bg-black/25 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-[box-shadow,border-color] duration-300 open:border-intuition-primary/25 open:shadow-[inset_0_1px_0_rgba(34,211,238,0.08),0_12px_40px_rgba(0,0,0,0.35)] [&[open]_summary_.skill-json-chevron]:rotate-90"
            >
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-3.5 py-2.5 font-sans text-xs font-medium text-slate-500 transition-colors hover:bg-white/[0.03] hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                    <span className="skill-json-chevron inline-block text-intuition-primary/90 transition-transform duration-200">▸</span> Technical details (JSON)
                </summary>
                <pre className="max-h-[min(360px,55vh)] overflow-auto border-t border-white/[0.06] p-3.5 text-[10px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap [overflow-wrap:anywhere] rounded-b-2xl">
                    {display || (
                        <span className="text-slate-500 italic font-sans">
                            No JSON in this block — the model may have skipped the payload or used a non-standard fence. Ask again for a
                            fenced JSON code block only.
                        </span>
                    )}
                </pre>
            </details>
        );
        last = m.index + m[0].length;
    }
    if (last === 0) {
        return <MarkdownSegment text={content} />;
    }
    if (last < content.length) {
        parts.push(<MarkdownSegment key={key++} text={content.slice(last)} />);
    }
    return <div className="space-y-1">{parts}</div>;
}

function loadSkillChatMessages(): Message[] {
    if (typeof window === 'undefined') return DEFAULT_SKILL_MESSAGES;
    try {
        const raw = localStorage.getItem(SKILL_CHAT_STORAGE_KEY);
        if (!raw) return DEFAULT_SKILL_MESSAGES;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SKILL_MESSAGES;
        const cleaned = parsed.filter(
            (m: unknown) =>
                m !== null &&
                typeof m === 'object' &&
                ((m as Message).role === 'user' || (m as Message).role === 'assistant') &&
                typeof (m as Message).content === 'string'
        ) as Message[];
        if (cleaned.length === 0) return DEFAULT_SKILL_MESSAGES;
        return cleaned.slice(-SKILL_CHAT_MAX_MESSAGES).map((m) => {
            /* A stale "pending" from a previous session disables Sign & broadcast; clear it. */
            const cleared =
                m.txOutcome === 'pending' ? { ...m, txOutcome: undefined, txError: undefined } : m;
            const existingId = typeof (cleared as { id?: unknown }).id === 'string' ? (cleared as { id: string }).id : '';
            const id = existingId.length > 0 ? existingId : newSkillMessageId();
            return { ...cleared, id };
        });
    } catch {
        return DEFAULT_SKILL_MESSAGES;
    }
}

const SkillChat: React.FC<SkillChatProps> = ({ className = '' }) => {
    const { address } = useAccount();
    const [messages, setMessages] = useState<Message[]>(loadSkillChatMessages);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [protocolReady, setProtocolReady] = useState<boolean | null>(null);
    const [enablingProtocol, setEnablingProtocol] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    /** When true, new messages keep the view pinned to the bottom; false if user scrolled up to read. */
    const stickToBottomRef = useRef(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const reduceMotion = useReducedMotion();

    const checkScrollPosition = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nearBottom = gap < 100;
        stickToBottomRef.current = nearBottom;
        const scrollable = el.scrollHeight > el.clientHeight + 40;
        setShowJumpToLatest(!nearBottom && scrollable);
    }, []);

    const jumpToLatest = useCallback(() => {
        playClick();
        const el = scrollRef.current;
        if (!el) return;
        stickToBottomRef.current = true;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        requestAnimationFrame(() => {
            checkScrollPosition();
        });
    }, [checkScrollPosition]);

    /** Grow textarea with content; cap height so long prompts scroll inside the box. */
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const maxPx = 200;
        el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
    }, [input]);

    useEffect(() => {
        try {
            localStorage.setItem(
                SKILL_CHAT_STORAGE_KEY,
                JSON.stringify(messages.slice(-SKILL_CHAT_MAX_MESSAGES))
            );
        } catch (e) {
            console.warn('Skill chat: could not persist history', e);
        }
    }, [messages]);

    useEffect(() => {
        if (!address) {
            setProtocolReady(null);
            return;
        }
        const addr = getAddress(address as `0x${string}`);
        setProtocolReady(hasCachedProxyApproval(addr) ? true : null);
        let cancelled = false;
        getProxyApprovalStatus(addr, { readRetries: 5, readDelayMs: 300 })
            .then((ok) => {
                if (!cancelled) setProtocolReady(ok);
            })
            .catch(() => {
                if (!cancelled) setProtocolReady(hasCachedProxyApproval(addr));
            });
        return () => {
            cancelled = true;
        };
    }, [address]);

    useEffect(() => {
        if (!stickToBottomRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => checkScrollPosition());
    }, [messages, loading, checkScrollPosition]);

    useEffect(() => {
        requestAnimationFrame(() => checkScrollPosition());
    }, [checkScrollPosition]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        stickToBottomRef.current = true;

        const userMsg = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { id: newSkillMessageId(), role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            if (!getGeminiApiKey() && !getGroqApiKey() && !getOpenAiApiKey()) {
                const assistantMessageId = newSkillMessageId();
                setMessages((prev) => [
                    ...prev,
                    {
                        id: assistantMessageId,
                        role: 'assistant',
                        content:
                            'Add `VITE_GROQ_API_KEY` (preferred) and/or `VITE_GEMINI_API_KEY` and/or `VITE_OPENAI_API_KEY` to `.env.local` to use the agent.',
                    },
                ]);
                if (address) {
                    notifyProtocolXpEarned({
                        address,
                        reasonKey: 'skill_chat',
                        dedupeKey: assistantMessageId,
                    });
                }
                return;
            }

            let promptUserMsg = userMsg;
            try {
                const live = await maybeFetchSkillLiveContext(userMsg);
                if (live) {
                    promptUserMsg = `${userMsg}\n\n---\n${live}\n---`;
                    logSkillEvent({ level: 'debug', event: 'skill.chat.live_context_attached' });
                }
            } catch (e) {
                logSkillEvent({ level: 'warn', event: 'skill.chat.live_context_error', error: e });
            }

            const routingAppendix = buildSkillWriteRoutingAppendix(userMsg);
            if (routingAppendix) {
                promptUserMsg = `${promptUserMsg}${routingAppendix}`;
                logSkillEvent({ level: 'debug', event: 'skill.chat.write_routing_appended' });
            }

            const { text: responseText, provider } = await generateSkillChatCompletion({
                systemPrompt: INTUITION_SKILL_FULL_SYSTEM_PROMPT,
                history: messages.slice(1).map((m) => ({ role: m.role, content: m.content })),
                userMsg: promptUserMsg,
            });

            if (import.meta.env.DEV) {
                console.info(`[Intuition Skill] Reply via: ${provider}`);
            }

            logSkillEvent({
                level: 'info',
                event: 'skill.chat.reply',
                detail: { provider, chars: responseText.length },
            });

            const jsonFenceRe = /```\s*json\s*([\s\S]*?)```/i;
            const jsonFenceExec = jsonFenceRe.exec(responseText);
            let jsonBlockBody: string | undefined;
            if (jsonFenceExec) {
                jsonBlockBody = resolveJsonBodyFromAssistantResponse(responseText, jsonFenceExec);
            } else {
                jsonBlockBody = extractFirstTopLevelJsonObject(responseText) ?? undefined;
            }
            if (jsonBlockBody != null) jsonBlockBody = jsonBlockBody.trim();
            let txIntent: any = null;
            let txBlockedReason: string | undefined;
            let skillParsedForRescue: Record<string, unknown> | null = null;
            let contentAppend = '';
            if (jsonBlockBody) {
                if (looksLikeGraphQLFencedAsJson(jsonBlockBody)) {
                    /* Model put GraphQL in a json fence; skip tx pipeline — answer text is still shown. */
                } else try {
                    const parsed = parseSkillTxJsonBlock(jsonBlockBody);
                    skillParsedForRescue = parsed as Record<string, unknown>;
                    const act = normalizeSkillAction(coalesceActionFields(parsed));
                    if (act === 'createatom' || act === 'createatoms') {
                        if (!address) {
                            contentAppend =
                                '\n\n_(Connect your wallet and send the same message again to build the transaction.)_';
                        } else {
                            const label = strFromParsed(parsed as Record<string, unknown>, 'label', 'atomLabel', 'name');
                            const depositTrust = String(parsed.depositTrust ?? '0').trim();
                            if (isPlaceholderAtomLabel(label)) {
                                contentAppend =
                                    '\n\n_(No on-chain preview: use a specific atom name in your message if you want to create one.)_';
                            } else {
                            const built = await buildCreateAtomTxIntent(address, label, depositTrust);
                            const onChainName = normalizeAtomLabel(label);
                            txIntent = {
                                action: 'createAtoms',
                                to: built.to,
                                data: built.data,
                                value: built.valueWei.toString(),
                                chainId: String(CHAIN_ID),
                                description:
                                    typeof parsed.description === 'string'
                                        ? parsed.description
                                        : `Create atom "${onChainName}"`,
                                txBuiltIn: true,
                                builtinLabel: onChainName,
                                builtinDepositTrust: depositTrust,
                                builtinDataHex: built.dataHex,
                            };
                            }
                        }
                    } else if (act === 'createtriple') {
                        const p = parsed as Record<string, unknown>;
                        const subject = strFromParsed(p, 'subject', 'subjectId', 'subjectTermId');
                        const predicate = strFromParsed(p, 'predicate', 'predicateId', 'predicateTermId');
                        const object = strFromParsed(p, 'object', 'objectId', 'objectTermId');
                        const depositTrust = normalizeTripleDepositTrust(parsed.depositTrust);
                        if (!subject || !predicate || !object) {
                            contentAppend = '\n\n_(createTriple JSON needs subject, predicate, and object — or subjectId / predicateId / objectId as hex term ids.)_';
                        } else {
                            txIntent = {
                                action: 'tripleFromLabels',
                                subjectLabel: subject,
                                predicateLabel: predicate,
                                objectLabel: object,
                                depositTrust,
                                chainId: String(CHAIN_ID),
                                description:
                                    typeof parsed.description === 'string'
                                        ? parsed.description
                                        : `Claim: ${subject} → ${predicate} → ${object}`,
                            };
                            if (!address) {
                                contentAppend =
                                    '\n\n_(Connect your wallet, then tap **Sign & broadcast** below.)_';
                            }
                        }
                    } else {
                        const parsedRec = parsed as Record<string, unknown>;
                        const shell =
                            skillJsonFenceLooksLikeShellTutorial(jsonBlockBody) ||
                            parsedRecordLooksLikeShellTemplate(parsedRec);
                        if (shell) {
                            txIntent = null;
                            txBlockedReason =
                                'This JSON block is from a **shell walkthrough** (placeholders like $MULTIVAULT, 0x$CALLDATA, or $(…)). Those are not real addresses or calldata — the app cannot open a wallet for them.\n\n' +
                                `Ask again for **only** one \`createAtom\` JSON: \`"action": "createAtom"\`, \`label\`, \`depositTrust\`, \`chainId": "${CHAIN_ID}"\` — no numbered steps, no \`curl\`/\`cast\`, no \`$\` variables.`;
                            logSkillEvent({
                                level: 'warn',
                                event: 'skill.chat.tx_intent_shell_template',
                                detail: { chars: jsonBlockBody.length },
                            });
                        } else {
                            const enriched = enrichTxIntentFromParsed(parsedRec);
                            const toS = typeof enriched.to === 'string' ? enriched.to.trim() : '';
                            const dataS = typeof enriched.data === 'string' ? enriched.data.trim() : '';
                            if (!toS || !dataS) {
                                txIntent = null;
                                const partial =
                                    Boolean(toS || dataS) ||
                                    (enriched.value != null && String(enriched.value).trim() !== '');
                                if (partial) {
                                    txBlockedReason =
                                        'This JSON cannot be signed: a raw transaction needs a real FeeProxy **`to`** address and **`data`** hex. For creating an atom, use the **`createAtom`** shape (`label`, `depositTrust`) instead of MultiVault/shell output.';
                                }
                            } else {
                                const rawErr = getRawSkillBroadcastValidationError(enriched);
                                if (rawErr) {
                                    logSkillEvent({
                                        level: 'warn',
                                        event: 'skill.chat.tx_intent_invalid',
                                        detail: { reason: rawErr.slice(0, 220) },
                                    });
                                    txIntent = null;
                                    txBlockedReason = rawErr;
                                } else {
                                    txIntent = enriched;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse or build tx intent', e);
                    if (looksLikeIntuRankTxIntentJson(jsonBlockBody)) {
                        contentAppend = `\n\n_(Could not build transaction: ${extractErrorText(e)})_`;
                    }
                }
            }

            if (!txIntent && txBlockedReason && address && skillParsedForRescue && jsonBlockBody) {
                const rescued = await tryRescueBuiltInCreateAtomAfterBadSkillJson(
                    address,
                    userMsg,
                    responseText,
                    jsonBlockBody,
                    skillParsedForRescue,
                );
                if (rescued) {
                    txIntent = rescued.intent;
                    txBlockedReason = undefined;
                    contentAppend += rescued.note;
                }
            }

            const assistantMessageId = newSkillMessageId();
            setMessages((prev) => [
                ...prev,
                {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: responseText + contentAppend,
                    txIntent,
                    txBlockedReason,
                    llmProvider: provider,
                },
            ]);
            if (address) {
                notifyProtocolXpEarned({
                    address,
                    reasonKey: 'skill_chat',
                    dedupeKey: assistantMessageId,
                });
            }
            logSkillEvent({
                level: 'info',
                event: 'skill.chat.message_saved',
                detail: { has_tx_intent: Boolean(txIntent), has_tx_blocked: Boolean(txBlockedReason) },
            });
        } catch (error: unknown) {
            console.error('Skill LLM error:', error);
            logSkillEvent({ level: 'error', event: 'skill.chat.llm_failed', error });
            setMessages((prev) => [
                ...prev,
                { id: newSkillMessageId(), role: 'assistant', content: formatSkillLlmError(error) },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const executeTx = async (intent: any, messageIndex: number) => {
        try {
        playClick();
        if (!address) {
            toast.error("Connect wallet first");
            return;
        }

        logSkillEvent({
            level: 'info',
            event: 'skill.tx.start',
            detail: { action: resolveSkillTxAction(intent as Record<string, unknown>), message_index: messageIndex },
        });

        const cid = parseInt(String(intent.chainId ?? CHAIN_ID), 10);
        if (cid !== CHAIN_ID) {
            toast.error(`Switch wallet to ${NETWORK_NAME} (chain ${CHAIN_ID})`);
            return;
        }

        /** Triple pipeline: create missing atoms (sequential txs) then triple. No single calldata. */
        if (isTripleFromLabelsIntent(intent)) {
            try {
                await switchNetwork();
                const approved = await getProxyApprovalStatus(address);
                if (!approved) {
                    await grantProxyApproval(address);
                    markProxyApproved(address);
                }
            } catch (setupErr: unknown) {
                const userRejected = isUserRejectionError(setupErr);
                const errText = userRejected
                    ? "Protocol approval cancelled in wallet"
                    : parseProtocolError(setupErr) || extractErrorText(setupErr) || "Network or protocol setup failed";
                toast.error(errText.length > 140 ? errText.slice(0, 137) + "…" : errText);
                setMessages((prev) =>
                    prev.map((msgItem, idx) =>
                        idx === messageIndex
                            ? {
                                  ...msgItem,
                                  txOutcome: userRejected ? ("rejected" as const) : ("failed" as const),
                                  txError: userRejected ? undefined : errText,
                              }
                            : msgItem
                    )
                );
                return;
            }
            setProtocolReady(true);
            setMessages((prev) =>
                prev.map((msgItem, idx) =>
                    idx === messageIndex ? { ...msgItem, txOutcome: "pending" as const, txError: undefined } : msgItem
                )
            );
            try {
                const result = await createTripleFromLabels(
                    String(intent.subjectLabel ?? ''),
                    String(intent.predicateLabel ?? ''),
                    String(intent.objectLabel ?? ''),
                    String(intent.depositTrust ?? '0.5'),
                    address,
                    (msg) => toast.info(msg)
                );
                if (result.tripleHash) {
                  toast.success('Triple broadcast confirmed.');
                  notifyProtocolXpEarned({
                    address,
                    reasonKey: 'skill_triple',
                    txHash: result.tripleHash,
                    depositTrustWei: parseEther(String(intent.depositTrust ?? '0.5')),
                  });
                } else {
                  toast.success('This claim already exists on-chain — open it below (no duplicate tx).');
                }
                logSkillEvent({
                    level: 'info',
                    event: 'skill.tx.success',
                    detail: {
                        action: 'tripleFromLabels',
                        tx_hash_prefix: (result.tripleHash ?? result.tripleTermId).slice(0, 12),
                        skipped_duplicate: !result.tripleHash,
                    },
                });
                window.dispatchEvent(new Event('local-tx-updated'));
                setMessages((prev) =>
                    prev.map((msgItem, idx) =>
                        idx === messageIndex
                            ? {
                                  ...msgItem,
                                  txOutcome: "success" as const,
                                  txHash: result.tripleHash,
                                  txTermId: String(result.tripleTermId),
                                  txAtomHashes:
                                    result.atomTxHashes.length > 0 ? result.atomTxHashes.map(String) : undefined,
                                  txError: undefined,
                              }
                            : msgItem
                    )
                );
            } catch (error: unknown) {
                const userRejected = isUserRejectionError(error);
                const errText = parseProtocolError(error) || extractErrorText(error) || "Triple pipeline failed";
                const shortErr = errText.length > 160 ? errText.slice(0, 157) + "…" : errText;
                setMessages((prev) =>
                    prev.map((msgItem, idx) =>
                        idx === messageIndex
                            ? {
                                  ...msgItem,
                                  txOutcome: userRejected ? ("rejected" as const) : ("failed" as const),
                                  txError: userRejected ? undefined : shortErr,
                              }
                            : msgItem
                    )
                );
                if (userRejected) toast.error("Transaction cancelled in wallet");
                else toast.error(shortErr.length > 140 ? shortErr.slice(0, 137) + "…" : shortErr);
                logSkillEvent({
                    level: userRejected ? 'info' : 'warn',
                    event: userRejected ? 'skill.tx.rejected' : 'skill.tx.failed',
                    detail: { action: 'tripleFromLabels', message: shortErr.slice(0, 200) },
                });
            }
            return;
        }

        const to = intent?.to as string | undefined;
        const dataRaw = intent?.data as string | undefined;
        if (!to || !isAddress(to)) {
            toast.error("Invalid transaction target (to)");
            return;
        }
        if (!dataRaw || !isHex(dataRaw)) {
            toast.error("Invalid calldata (data must be 0x-hex)");
            return;
        }
        let valueWei: bigint;
        try {
            valueWei = BigInt(String(intent.value ?? '0'));
        } catch {
            toast.error("Invalid value (wei string)");
            return;
        }

        const action = resolveSkillTxAction(intent as Record<string, unknown>);
        const toLc = to.toLowerCase();
        const targetsFeeProxy = toLc === FEE_PROXY_ADDRESS.toLowerCase();
        // createAtoms / createTriples / deposit via FeeProxy require MultiVault operator approval for the fee proxy.
        const needsProxy =
            action === 'createTriples' ||
            action === 'createAtoms' ||
            action === 'deposit' ||
            targetsFeeProxy;

        // Protocol approval must happen BEFORE preflight for FeeProxy calls.
        try {
            await switchNetwork();
            if (needsProxy) {
                const approved = await getProxyApprovalStatus(address);
                if (!approved) {
                    await grantProxyApproval(address);
                    markProxyApproved(address);
                }
            }
        } catch (setupErr: unknown) {
            const userRejected = isUserRejectionError(setupErr);
            const errText = userRejected
                ? "Protocol approval cancelled in wallet"
                : parseProtocolError(setupErr) || extractErrorText(setupErr) || "Network or protocol setup failed";
            toast.error(errText.length > 140 ? errText.slice(0, 137) + "…" : errText);
            setMessages((prev) =>
                prev.map((msgItem, idx) =>
                    idx === messageIndex
                        ? {
                              ...msgItem,
                              txOutcome: userRejected ? ("rejected" as const) : ("failed" as const),
                              txError: userRejected ? undefined : errText,
                          }
                        : msgItem
                )
            );
            return;
        }

        setProtocolReady(true);

        const preflight = await preflightSkillBroadcast(address, to as `0x${string}`, valueWei, dataRaw as `0x${string}`);
        if (!preflight.ok) {
            const errMsg = preflight.message;
            toast.error(errMsg.length > 140 ? errMsg.slice(0, 137) + "…" : errMsg);
            setMessages((prev) =>
                prev.map((msgItem, idx) =>
                    idx === messageIndex
                        ? { ...msgItem, txOutcome: "failed" as const, txError: errMsg }
                        : msgItem
                )
            );
            return;
        }

        setMessages((prev) =>
            prev.map((msgItem, idx) =>
                idx === messageIndex ? { ...msgItem, txOutcome: "pending" as const, txError: undefined } : msgItem
            )
        );

        try {
            const hash = await broadcastTransaction(address, to as `0x${string}`, valueWei, dataRaw as `0x${string}`);
            toast.success("Transaction broadcasted!");
            let depositTrustWei: bigint | null = null;
            if (action === 'deposit') {
              depositTrustWei = valueWei;
            } else {
              const depRaw = intent?.builtinDepositTrust ?? intent?.depositTrust;
              if (typeof depRaw === 'string' && depRaw.trim()) {
                try {
                  depositTrustWei = parseEther(depRaw.trim());
                } catch {
                  depositTrustWei = null;
                }
              }
            }
            if (targetsFeeProxy) {
              if (action === 'deposit') {
                notifyProtocolXpEarned({
                  address,
                  reasonKey: 'market_acquire',
                  txHash: hash,
                  depositTrustWei: depositTrustWei ?? undefined,
                });
              } else if (action === 'createAtoms') {
                notifyProtocolXpEarned({
                  address,
                  reasonKey: 'skill_atom',
                  txHash: hash,
                  depositTrustWei: depositTrustWei ?? undefined,
                });
              } else if (action === 'createTriples') {
                notifyProtocolXpEarned({
                  address,
                  reasonKey: 'skill_triple',
                  txHash: hash,
                  depositTrustWei: depositTrustWei ?? undefined,
                });
              }
            }
            logSkillEvent({
                level: 'info',
                event: 'skill.tx.success',
                detail: { action, tx_hash_prefix: String(hash).slice(0, 12) },
            });
            let txTermId: string | undefined;
            try {
                if (intent.txBuiltIn && intent.builtinDataHex) {
                    txTermId = await getAtomTermIdFromTxHash(hash as `0x${string}`, intent.builtinDataHex as `0x${string}`);
                } else if (targetsFeeProxy && action === 'createAtoms') {
                    txTermId = await getAtomTermIdFromTxHash(hash as `0x${string}`);
                } else if (targetsFeeProxy && action === 'createTriples') {
                    txTermId = await getTripleTermIdFromTxHash(hash as `0x${string}`);
                }
            } catch {
                /* non-fatal */
            }
            setMessages((prev) =>
                prev.map((msgItem, idx) =>
                    idx === messageIndex
                        ? {
                              ...msgItem,
                              txOutcome: 'success' as const,
                              txHash: hash,
                              txTermId,
                              txError: undefined,
                          }
                        : msgItem
                )
            );
        } catch (error: unknown) {
            const userRejected = isUserRejectionError(error);
            const errText = parseProtocolError(error) || extractErrorText(error) || "Execution failed";
            const shortErr = errText.length > 160 ? errText.slice(0, 157) + "…" : errText;
            setMessages((prev) =>
                prev.map((msgItem, idx) =>
                    idx === messageIndex
                        ? {
                              ...msgItem,
                              txOutcome: userRejected ? ('rejected' as const) : ('failed' as const),
                              txError: userRejected ? undefined : shortErr,
                          }
                        : msgItem
                )
            );
            if (userRejected) {
                toast.error("Transaction cancelled in wallet");
            } else {
                toast.error(shortErr.length > 140 ? shortErr.slice(0, 137) + "…" : shortErr);
            }
            logSkillEvent({
                level: userRejected ? 'info' : 'warn',
                event: userRejected ? 'skill.tx.rejected' : 'skill.tx.failed',
                detail: { action, message: shortErr.slice(0, 200) },
            });
        }
        } catch (unexpected: unknown) {
            logSkillEvent({
                level: 'error',
                event: 'skill.tx.unexpected',
                error: unexpected,
                detail: { message_index: messageIndex },
            });
            toast.error('Unexpected error. Try again.');
            setMessages((prev) =>
                prev.map((msgItem, idx) =>
                    idx === messageIndex
                        ? {
                              ...msgItem,
                              txOutcome: 'failed' as const,
                              txError: extractErrorText(unexpected),
                          }
                        : msgItem
                )
            );
        }
    };

    return (
        <div
            className={`flex flex-col h-full min-h-0 max-h-full w-full min-w-0 overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-[#10131a] via-[#0b0d12] to-[#060708] shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset] ring-1 ring-white/[0.05] ${className}`}
        >
            {/* Header — standard chat toolbar */}
            <header className="shrink-0 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0f1117]/80 px-3 py-3 backdrop-blur-xl sm:px-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-intuition-primary/30 bg-gradient-to-br from-intuition-primary/25 to-intuition-primary/5 text-intuition-primary shadow-[0_8px_24px_rgba(34,211,238,0.12)]">
                        <Terminal size={18} strokeWidth={2} aria-hidden />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-white font-sans tracking-tight leading-tight">Skill agent</span>
                        <span className="text-[11px] text-slate-500 font-sans leading-tight mt-0.5">{NETWORK_NAME} �/ chain {CHAIN_ID}</span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        playClick();
                        try {
                            localStorage.removeItem(SKILL_CHAT_STORAGE_KEY);
                        } catch {
                            /* ignore */
                        }
                        stickToBottomRef.current = true;
                        setMessages(DEFAULT_SKILL_MESSAGES);
                        toast.info('Chat cleared');
                    }}
                    onMouseEnter={playHover}
                    className="shrink-0 rounded-full border border-transparent px-3.5 py-2 font-sans text-xs font-medium text-slate-400 transition-all hover:border-white/10 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/40 active:scale-[0.98]"
                >
                    Clear chat
                </button>
            </header>

            {address && (
                <div className="shrink-0 border-b border-white/[0.06] bg-[#08090c]/90 px-3 py-2.5 backdrop-blur-md sm:px-4">
                    {protocolReady === null ? (
                        <p className="text-xs text-slate-500 font-sans">Checking permissions</p>
                    ) : protocolReady ? (
                        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-xs font-sans text-emerald-300/95 shadow-[0_0_24px_rgba(16,185,129,0.08)]">
                            <ShieldCheck size={14} className="shrink-0" />
                            <span>IntuRank fee proxy is enabled.</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-amber-100/90 leading-snug min-w-0 font-sans">
                                Enable IntuRank fee proxy for atoms, claims, and deposits. One wallet approval.
                            </p>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!address) return;
                                    playClick();
                                    setEnablingProtocol(true);
                                    try {
                                        await switchNetwork();
                                        await grantProxyApproval(address);
                                        markProxyApproved(address);
                                        setProtocolReady(true);
                                        toast.success('IntuRank fee proxy enabled.');
                                    } catch (e: unknown) {
                                        toast.error(parseProtocolError(e) || extractErrorText(e) || 'Could not enable protocol');
                                    } finally {
                                        setEnablingProtocol(false);
                                    }
                                }}
                                disabled={enablingProtocol}
                                onMouseEnter={playHover}
                                className="shrink-0 inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/80 bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_8px_28px_rgba(245,158,11,0.28)] transition-transform hover:bg-amber-400 disabled:opacity-50 active:scale-[0.98]"
                            >
                                {enablingProtocol ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                Enable fee proxy
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Message list — scroll container; aria-live for screen readers */}
            <div className="relative flex flex-1 min-h-0 min-w-0 flex-col">
                <div
                    ref={scrollRef}
                    onScroll={checkScrollPosition}
                    role="log"
                    aria-relevant="additions"
                    aria-label="Skill conversation"
                    className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-y-contain scroll-smooth bg-[#060708]/50 px-3 py-4 [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin] sm:px-4 sm:py-6"
                >
                <div className="flex flex-col gap-5">
                <AnimatePresence initial={false} mode="sync">
                {messages.map((m, i) => {
                    const otherTxPending = messages.some((mm, idx) => mm.txOutcome === 'pending' && idx !== i);
                    return (
                    <motion.div
                        key={m.id}
                        initial={
                            reduceMotion
                                ? false
                                : m.role === 'user'
                                  ? { opacity: 0, x: 36, scale: 0.94 }
                                  : { opacity: 0, x: -36, scale: 0.94 }
                        }
                        animate={{
                            opacity: 1,
                            x: 0,
                            scale: 1,
                        }}
                        exit={
                            reduceMotion
                                ? { opacity: 0, transition: { duration: 0.12 } }
                                : {
                                      opacity: 0,
                                      scale: 0.96,
                                      y: -10,
                                      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                                  }
                        }
                        transition={{
                            type: 'spring',
                            stiffness: 380,
                            damping: 28,
                            mass: 0.88,
                        }}
                        className={`flex w-full min-w-0 ${m.role === 'user' ? 'justify-end' : 'justify-start'} space-y-0`}
                    >
                        <div
                            className={`flex gap-2.5 sm:gap-3 w-full min-w-0 ${m.role === 'user' ? 'flex-row-reverse max-w-[min(100%,28rem)] ml-auto' : 'max-w-[min(100%,40rem)]'}`}
                        >
                            <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${m.role === 'user' ? 'border border-intuition-primary/35 bg-gradient-to-br from-intuition-primary/30 to-intuition-primary/10 text-intuition-primary shadow-[0_6px_20px_rgba(34,211,238,0.15)]' : 'border border-white/[0.1] bg-white/[0.06] text-slate-300 backdrop-blur-sm'}`}
                                aria-hidden
                            >
                                {m.role === 'user' ? <User size={15} strokeWidth={2} /> : <Bot size={15} strokeWidth={2} />}
                            </div>
                            <div className="min-w-0 flex-1 space-y-4">
                                <div
                                    className={`min-w-0 max-w-full rounded-3xl px-4 py-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.22)] backdrop-blur-md sm:px-4 sm:py-4 ${m.role === 'user' ? 'rounded-br-2xl border border-intuition-primary/35 bg-gradient-to-br from-intuition-primary/22 to-intuition-primary/[0.08] text-white' : 'rounded-bl-2xl border border-white/[0.08] bg-[#12151c]/85 text-slate-200'}`}
                                >
                                    {m.role === 'assistant' ? (
                                        <div className="text-[13px] leading-[1.65] text-slate-300 font-sans">
                                            <AssistantMessageBody content={m.content} />
                                            {m.llmProvider && (
                                                <p
                                                    className="mt-3 pt-2.5 border-t border-white/[0.06] text-[10px] text-slate-500 font-mono tracking-wide"
                                                    title="Which API served this reply (Groq first; Gemini/OpenAI if fallback ran)."
                                                >
                                                    Reply via:{' '}
                                                    <span className="text-slate-400">
                                                        {m.llmProvider === 'gemini'
                                                            ? 'Google Gemini'
                                                            : m.llmProvider === 'groq'
                                                              ? 'Groq'
                                                              : 'OpenAI'}
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-[13px] leading-[1.65] font-sans text-white/95 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                            {m.content}
                                        </div>
                                    )}
                                </div>
                                {m.role === 'assistant' && m.txBlockedReason && !m.txIntent && (
                                    <div
                                        className="w-full max-w-full min-w-0 space-y-3 rounded-3xl border border-amber-500/40 bg-gradient-to-b from-amber-950/55 via-amber-950/25 to-black/80 p-4 shadow-[0_0_40px_rgba(245,158,11,0.14)] ring-1 ring-amber-400/20 backdrop-blur-md sm:p-5"
                                        role="status"
                                        aria-label="Transaction cannot be signed"
                                    >
                                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-200 font-sans">
                                            <AlertTriangle size={20} className="shrink-0 text-amber-400" />
                                            <span>Why there is no Sign &amp; broadcast</span>
                                        </div>
                                        <p className="text-[13px] leading-relaxed text-slate-200 font-sans whitespace-pre-wrap [overflow-wrap:anywhere]">
                                            {m.txBlockedReason}
                                        </p>
                                        <p className="text-[11px] leading-relaxed text-slate-500 font-sans border-t border-white/10 pt-3">
                                            Example prompt: “Output <span className="text-slate-400">only</span> the{' '}
                                            <code className="text-cyan-200/90">createAtom</code> JSON for{' '}
                                            <span className="text-white font-semibold">Video Calls</span>, depositTrust 0.5 — no
                                            shell steps.”
                                        </p>
                                    </div>
                                )}
                                {m.txIntent && (
                                    <motion.div
                                        initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 380,
                                            damping: 28,
                                            mass: 0.85,
                                        }}
                                        className={[
                                            'w-full max-w-full min-w-0 rounded-3xl border transition-[min-height,padding,box-shadow] duration-500 ease-out backdrop-blur-md',
                                            !m.txOutcome &&
                                                'bg-gradient-to-b from-amber-950/50 to-black/80 border-amber-500/40 p-5 sm:p-6 space-y-5 shadow-[0_0_48px_rgba(245,158,11,0.12)] ring-1 ring-amber-400/15',
                                            m.txOutcome === 'pending' &&
                                                'min-h-[min(16rem,48vh)] skill-tx-pending-glow bg-gradient-to-b from-amber-950/60 to-black/90 border-amber-400/50 p-5 sm:p-6 space-y-5 shadow-[0_0_56px_rgba(245,158,11,0.18)] ring-1 ring-amber-300/20',
                                            m.txOutcome === 'success' &&
                                                'bg-gradient-to-b from-emerald-950/55 to-black/85 border-emerald-400/50 p-5 sm:p-6 space-y-4 shadow-[0_0_40px_rgba(16,185,129,0.22)] ring-1 ring-emerald-400/20',
                                            m.txOutcome === 'rejected' &&
                                                'bg-red-950/40 border-red-500/70 p-5 sm:p-6 space-y-4 shadow-[0_0_24px_rgba(239,68,68,0.14)]',
                                            m.txOutcome === 'failed' &&
                                                'bg-red-950/40 border-red-600/70 p-5 sm:p-6 space-y-4 shadow-[0_0_24px_rgba(239,68,68,0.14)]',
                                        ]
                                            .filter(Boolean)
                                            .join(' ')}
                                    >
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-sans text-sm font-semibold min-w-0">
                                            {m.txOutcome === 'success' &&
                                                <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />}
                                            {m.txOutcome === 'rejected' &&
                                                <XCircle size={22} className="text-red-400 shrink-0" />}
                                            {m.txOutcome === 'failed' &&
                                                <XCircle size={22} className="text-red-500 shrink-0" />}
                                            {m.txOutcome === 'pending' && (
                                                <Loader2 size={22} className="text-amber-400 shrink-0 animate-spin" />
                                            )}
                                            {!m.txOutcome && <Zap size={22} className="text-amber-400 shrink-0" />}
                                            <span
                                                className={`min-w-0 [overflow-wrap:anywhere] ${
                                                    m.txOutcome === 'success'
                                                        ? 'text-emerald-400'
                                                        : m.txOutcome === 'rejected' || m.txOutcome === 'failed'
                                                          ? 'text-red-400'
                                                          : m.txOutcome === 'pending'
                                                            ? 'text-amber-300'
                                                            : 'text-amber-200'
                                                }`}
                                            >
                                                {m.txOutcome === 'pending' && 'Waiting for wallet'}
                                                {m.txOutcome === 'success' && 'Confirmed on-chain'}
                                                {m.txOutcome === 'rejected' && 'Cancelled'}
                                                {m.txOutcome === 'failed' && 'Failed'}
                                                {!m.txOutcome && 'Review transaction'}
                                            </span>
                                        </div>

                                        {(m.txOutcome === undefined || m.txOutcome === 'pending') && (
                                            <div className="rounded-2xl border border-white/[0.1] bg-black/40 p-3 font-sans text-xs text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm sm:p-4 sm:text-sm">
                                                {isTripleFromLabelsIntent(m.txIntent) ? (
                                                    <>
                                                        <p className="mb-3 flex items-center gap-2 rounded-xl bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200/95 border border-violet-500/20">
                                                            <Layers size={14} className="shrink-0" />
                                                            Triple (claim)
                                                        </p>
                                                        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                                                            {tripleUiResolutionLine(
                                                                String(m.txIntent.subjectLabel ?? ''),
                                                                String(m.txIntent.predicateLabel ?? ''),
                                                                String(m.txIntent.objectLabel ?? '')
                                                            )}
                                                        </p>
                                                        <div className="grid gap-2 text-[11px] sm:text-xs">
                                                            <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                                                <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subject</span>
                                                                <span className="text-right font-bold text-white break-all">{m.txIntent.subjectLabel}</span>
                                                            </div>
                                                            <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                                                <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Predicate</span>
                                                                <span className="text-right font-bold text-white break-all">{m.txIntent.predicateLabel}</span>
                                                            </div>
                                                            <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                                                <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Object</span>
                                                                <span className="text-right font-bold text-white break-all">{m.txIntent.objectLabel}</span>
                                                            </div>
                                                            <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-intuition-primary/25 bg-intuition-primary/[0.06] px-3 py-2.5">
                                                                <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Deposit</span>
                                                                <span className="text-right font-bold text-intuition-primary/95">{m.txIntent.depositTrust} {CURRENCY_SYMBOL}</span>
                                                            </div>
                                                        </div>
                                                        <p className="mt-3 text-xs leading-relaxed text-slate-500">
                                                            You may need to approve more than one transaction in order. That is normal.
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        {m.txIntent.txBuiltIn && (
                                                            <p className="mb-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200/95">
                                                                New atom (built in-app)
                                                            </p>
                                                        )}
                                                        <div className="grid gap-2">
                                                            <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                                                <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Action</span>
                                                                <span className="text-right font-bold text-white">{skillTxActionDisplayLabel(m.txIntent)}</span>
                                                            </div>
                                                            {m.txIntent.txBuiltIn && m.txIntent.builtinLabel != null && (
                                                                <>
                                                                    <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                                                        <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Atom</span>
                                                                        <span className="text-right font-bold text-white break-all">{m.txIntent.builtinLabel}</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                                                        <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Deposit</span>
                                                                        <span className="text-right font-bold text-white">
                                                                            {m.txIntent.builtinDepositTrust} {CURRENCY_SYMBOL}
                                                                        </span>
                                                                    </div>
                                                                </>
                                                            )}
                                                            {m.txIntent.value != null && (
                                                                <div className="grid grid-cols-[minmax(4.25rem,auto)_1fr] items-start gap-x-3 gap-y-1 rounded-xl border border-amber-400/35 bg-amber-500/[0.08] px-3 py-2.5">
                                                                    <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">Total</span>
                                                                    <span className="text-right font-bold text-amber-100">
                                                                        {(Number(m.txIntent.value) / 1e18).toFixed(4)} {CURRENCY_SYMBOL}
                                                                        {m.txIntent.txBuiltIn && (
                                                                            <span className="mt-0.5 block text-[10px] font-normal text-amber-200/70">Fee + deposit</span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {m.txOutcome === 'pending' && (
                                            <div className="space-y-4 pt-1">
                                                <div className="h-2.5 rounded-full bg-black/50 border border-amber-500/30 overflow-hidden">
                                                    <div
                                                        className="h-full w-[200%] skill-tx-roll-strip opacity-90"
                                                        style={{
                                                            background:
                                                                'linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.15) 20%, rgba(251,191,36,0.55) 50%, rgba(245,158,11,0.15) 80%, transparent 100%)',
                                                        }}
                                                    />
                                                </div>
                                                <div className="h-2 rounded-full bg-black/40 border border-amber-500/20 overflow-hidden opacity-80">
                                                    <div
                                                        className="h-full w-[200%] skill-tx-roll-strip opacity-70"
                                                        style={{
                                                            animationDelay: '0.35s',
                                                            background:
                                                                'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.08) 25%, rgba(253,230,138,0.4) 50%, rgba(251,191,36,0.08) 75%, transparent 100%)',
                                                        }}
                                                    />
                                                </div>
                                                <p className="text-xs text-amber-100/90 font-sans leading-relaxed [overflow-wrap:anywhere]">
                                                    {isTripleFromLabelsIntent(m.txIntent)
                                                        ? 'Approve atom batch if prompted (one signature for all new anchors), then the claim.'
                                                        : 'Approve or reject in your wallet.'}
                                                </p>
                                            </div>
                                        )}

                                        {m.txOutcome === 'success' && (
                                            <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-black/45 p-4 backdrop-blur-sm">
                                                <p className="text-xs font-semibold text-emerald-400/95 font-sans">
                                                    Done
                                                </p>
                                                <p className="text-sm text-slate-300 font-sans leading-relaxed">
                                                    {isTripleFromLabelsIntent(m.txIntent) && !m.txHash && m.txTermId
                                                        ? 'Nothing new to mint — this claim was already on-chain.'
                                                        : 'Your transaction is on-chain.'}
                                                </p>
                                                {m.txAtomHashes && m.txAtomHashes.length > 0 && (
                                                    <p className="text-xs text-slate-500 font-sans leading-relaxed">
                                                        {m.txAtomHashes.length === 1
                                                            ? 'Atoms anchored in one batched transaction — see explorer.'
                                                            : `Signed ${m.txAtomHashes.length} atom transactions — see explorer for details.`}
                                                    </p>
                                                )}
                                                {m.txHash ? (
                                                    <div className="space-y-2">
                                                        <span className="text-xs font-medium text-slate-500 block font-sans">
                                                            {isTripleFromLabelsIntent(m.txIntent) ? 'Triple transaction' : 'Transaction'}
                                                        </span>
                                                        <p
                                                            className="text-[11px] font-mono text-slate-200 break-all"
                                                            title={m.txHash}
                                                        >
                                                            {m.txHash.slice(0, 14)}…{m.txHash.slice(-12)}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs font-sans text-slate-500">
                                                        {isTripleFromLabelsIntent(m.txIntent) && m.txTermId
                                                            ? 'No transaction hash — claim already existed (use Open claim).'
                                                            : 'Hash unavailable.'}
                                                    </p>
                                                )}
                                                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1">
                                                    {m.txHash && (
                                                        <a
                                                            href={`${intuitionChain.blockExplorers.default.url}/tx/${m.txHash}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500/55 px-5 py-3 font-sans text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10"
                                                        >
                                                            <ExternalLink size={16} /> Explorer
                                                        </a>
                                                    )}
                                                    {m.txTermId && (
                                                        <Link
                                                            to={`/markets/${m.txTermId}`}
                                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-sans text-sm font-bold text-black shadow-[0_10px_36px_rgba(16,185,129,0.35)] transition-transform hover:bg-emerald-400 active:scale-[0.99]"
                                                        >
                                                            <ExternalLink size={16} />
                                                            {isTripleFromLabelsIntent(m.txIntent) ? 'Open claim' : 'Open atom'}
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {m.txOutcome === 'rejected' && (
                                            <p className="text-sm text-red-200/95 font-sans leading-relaxed">
                                                Declined in wallet.
                                            </p>
                                        )}

                                        {m.txOutcome === 'failed' && (
                                            <p className="text-sm text-red-200/95 font-sans leading-relaxed">
                                                {m.txError || 'Something went wrong.'}
                                            </p>
                                        )}

                                        {!m.txOutcome && !address && m.txIntent && (
                                            <p className="rounded-2xl border border-amber-500/30 bg-amber-950/45 px-3.5 py-2.5 text-xs font-sans leading-relaxed text-amber-100/95 backdrop-blur-sm">
                                                Connect your wallet (top of the app) to unlock <span className="font-semibold">Sign &amp; broadcast</span>.
                                            </p>
                                        )}
                                        {!m.txOutcome && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (otherTxPending) {
                                                        toast.info(
                                                            'Another transaction is still waiting for your wallet. Approve or reject it first.'
                                                        );
                                                        return;
                                                    }
                                                    void executeTx(m.txIntent, i);
                                                }}
                                                disabled={!address}
                                                title={
                                                    !address
                                                        ? 'Connect your wallet'
                                                        : otherTxPending
                                                          ? 'Another wallet request is pending'
                                                          : 'Sign and broadcast'
                                                }
                                                className={`font-sans w-full inline-flex items-center justify-center gap-2.5 rounded-2xl border border-amber-200/90 bg-gradient-to-b from-amber-400 to-amber-500 px-6 py-4 text-sm font-bold text-black shadow-[0_12px_40px_rgba(245,158,11,0.38)] transition-all hover:from-amber-300 hover:to-amber-400 hover:shadow-[0_14px_44px_rgba(245,158,11,0.45)] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99] ${!address || otherTxPending ? 'opacity-60' : ''}`}
                                            >
                                                <CheckCircle2 size={20} /> Sign &amp; broadcast
                                            </button>
                                        )}
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                    );
                })}
                {loading && (
                    <motion.div
                        key="skill-chat-thinking"
                        initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={
                            reduceMotion
                                ? { opacity: 0, transition: { duration: 0.1 } }
                                : {
                                      opacity: 0,
                                      y: 6,
                                      scale: 0.99,
                                      transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                                  }
                        }
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="flex min-w-0 justify-start"
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <div className="flex min-w-0 max-w-[min(100%,40rem)] items-center gap-3 font-sans text-sm text-slate-400">
                            <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.06] text-slate-400 backdrop-blur-sm"
                                aria-hidden
                            >
                                <Bot size={15} strokeWidth={2} />
                            </div>
                            <div className="flex items-center gap-2 rounded-3xl rounded-bl-2xl border border-white/[0.09] bg-[#12151c]/90 px-4 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.25)] backdrop-blur-md">
                                <span className="text-[13px] text-slate-400">Thinking</span>
                                <span className="flex gap-1" aria-hidden>
                                    {[0, 1, 2].map((dot) => (
                                        <span
                                            key={dot}
                                            className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce"
                                            style={{ animationDelay: `${dot * 0.12}s` }}
                                        />
                                    ))}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>
                </div>
                </div>

                {showJumpToLatest && (
                    <button
                        type="button"
                        onClick={jumpToLatest}
                        onMouseEnter={playHover}
                        className="pointer-events-auto absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#14161f]/95 px-3 py-1.5 text-[11px] font-semibold font-sans text-slate-200 shadow-lg backdrop-blur-md hover:bg-[#1a1d28] hover:border-intuition-primary/35 hover:text-intuition-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/45"
                        aria-label="Jump to latest message"
                    >
                        <ChevronsDown size={14} className="shrink-0 opacity-90" aria-hidden />
                        Jump to latest
                    </button>
                )}
            </div>

            {/* Composer — fixed footer, standard enter-to-send */}
            <div className="shrink-0 border-t border-white/[0.08] bg-[#0a0c10]/95 px-3 pb-3 pt-2.5 backdrop-blur-xl sm:px-4 sm:pb-4">
                <div className="relative flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-[#12151c]/50 py-1.5 pl-2 pr-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus-within:border-intuition-primary/40 focus-within:ring-2 focus-within:ring-intuition-primary/20">
                    <label htmlFor="skill-chat-input" className="sr-only">
                        Message to Skill agent
                    </label>
                    <textarea
                        id="skill-chat-input"
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            if (e.shiftKey) return;
                            if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                            e.preventDefault();
                            void handleSend();
                        }}
                        rows={1}
                        placeholder="Message…"
                        autoComplete="off"
                        className="min-h-[48px] max-h-[200px] w-full resize-none rounded-xl border-0 bg-transparent py-2.5 pl-2 pr-14 font-sans text-sm leading-relaxed text-white caret-intuition-primary placeholder:text-slate-500 focus:outline-none focus:ring-0"
                    />
                    <motion.button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={!input.trim() || loading}
                        aria-label="Send message"
                        whileTap={
                            reduceMotion || !input.trim() || loading ? undefined : { scale: 0.88 }
                        }
                        whileHover={
                            reduceMotion || !input.trim() || loading ? undefined : { scale: 1.06 }
                        }
                        transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.45 }}
                        className="absolute bottom-1.5 right-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-intuition-primary to-cyan-500 text-black shadow-[0_8px_28px_rgba(34,211,238,0.35)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#12151c]"
                    >
                        <Send size={17} strokeWidth={2.25} className="drop-shadow-sm" aria-hidden />
                    </motion.button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-0.5">
                    <p className="text-[10px] text-slate-600 font-sans select-none">
                        <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-px font-mono text-[9px] text-slate-500">Enter</kbd>
                        {' '}to send �/{' '}
                        <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-px font-mono text-[9px] text-slate-500">Shift</kbd>
                        +
                        <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-px font-mono text-[9px] text-slate-500">Enter</kbd>
                        {' '}new line
                    </p>
                </div>
                <div className="mt-2.5 flex snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-visible pb-1 scrollbar-none [-webkit-overflow-scrolling:touch]">
                    {[
                        { short: 'Create an atom', full: 'Create an atom called IntuRank Sandbox with 0.5 TRUST deposit' },
                        { short: 'Alice trusts Bob', full: 'Create a triple: subject Alice, predicate trusts, object Bob, deposit 0.5 TRUST' },
                        { short: 'Atoms vs triples', full: 'What is the difference between an atom and a triple?' },
                        { short: 'Contract addresses', full: 'What are the FeeProxy and MultiVault addresses used in this app?' },
                    ].map((suggestion, i) => (
                        <button
                            key={i}
                            type="button"
                            title={suggestion.full}
                            onClick={() => setInput(suggestion.full)}
                            className="max-w-[220px] shrink-0 snap-start truncate rounded-full border border-white/[0.1] bg-white/[0.05] px-4 py-2 font-sans text-[11px] font-medium text-slate-400 shadow-sm transition-all hover:border-intuition-primary/30 hover:bg-intuition-primary/10 hover:text-slate-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/40"
                        >
                            {suggestion.short}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SkillChat;
