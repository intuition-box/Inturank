import { CHAIN_ID } from '../constants';

/**
 * When the user clearly wants an in-app write, append this so Groq/OpenAI prefer
 * createAtom / createTriple JSON over upstream cast/bash tutorials in the skill corpus.
 */
export function buildSkillWriteRoutingAppendix(userMsg: string): string {
  const t = userMsg.trim();
  if (!t) return '';
  const tl = t.toLowerCase();

  const atomWrite =
    /\b(create|add|mint|make|register)\s+(an?\s+)?atom\b/i.test(t) ||
    /\b(create|add|mint|make)\s+.{0,6}atom\s+named\b/i.test(t) ||
    /\b(atom|entity)\s+named\b/i.test(t);
  const wantsCliAfterJson =
    /\bcast(\s+calldata)?\b/i.test(t) ||
    (/\bcalldata\b/i.test(t) && /\b(multi\s*vault|multivault)\b/i.test(tl)) ||
    (/\b(show|give|print|write|output|exact)\b/i.test(tl) && /\b(cast|calldata|hex)\b/i.test(tl));
  if (atomWrite) {
    if (wantsCliAfterJson) {
      return (
        `\n\n---\n**[IntuRank — required for this user message]**\n` +
        `The user wants **create atom** (Sign & broadcast) **and** developer \`cast\` / MultiVault detail.\n\n` +
        `1. At most **2 short sentences** first.\n` +
        `2. **First** output **exactly one** \`\`\`json\`\`\` block: \`"action": "createAtom"\`, correct \`label\` and \`depositTrust\`, \`chainId\`: "${CHAIN_ID}", \`description\` — required for signing.\n` +
        `3. **After** that JSON fence, add a separate \`\`\`bash\`\`\` or \`\`\`text\`\`\` block with \`cast calldata\` or CLI notes; mark it **CLI-only / optional**. Never put shell inside the \`json\` fence.\n---`
      );
    }
    return (
      `\n\n---\n**[IntuRank — required for this user message]**\n` +
      `The user wants to **create an atom** and use the in-app **Sign & broadcast** button.\n\n` +
      `1. At most **2 short sentences** of explanation.\n` +
      `2. Then **exactly one** \`\`\`json\`\`\` code block: \`"action": "createAtom"\`, \`label\` = the **exact** name they gave (preserve spacing/casing unless they ask to normalize), ` +
      `\`depositTrust\` as they asked (default \`"0.5"\` if unspecified), \`chainId\`: "${CHAIN_ID}", plus a one-line \`description\`.\n\n` +
      `**Do not** use \`cast\`, bash, \`curl\` steps, FeeProxy/MultiVault raw \`to\`/\`data\`, calldata tutorials, or placeholder hex as your primary answer ` +
      `(they block signing). CLI is only after JSON if they explicitly asked for cast/calldata in the same message.\n---`
    );
  }

  const tripleWrite =
    /\b(create|add|make)\s+(an?\s+)?(triple|claim)\b/i.test(t) ||
    (/\b(create|add|make)\b/i.test(t) && /\btrusts\b/i.test(t) && /\b(and|→|->|\/)\b/i.test(t));
  const tripleChip =
    /^\s*[^?\n]{1,56}\s+trusts\s+[^?\n]{1,56}\s*$/i.test(t) &&
    !/\b(what|how|why|explain|mean|difference|vs\.?|versus)\b/i.test(tl);
  if (tripleWrite || tripleChip) {
    return (
      `\n\n---\n**[IntuRank — required for this user message]**\n` +
      `The user wants a **claim (triple)** and the in-app **Sign & broadcast** flow.\n\n` +
      `1. At most **2 short sentences**.\n` +
      `2. Then **exactly one** \`\`\`json\`\`\` with \`"action": "createTriple"\`, \`subject\`, \`predicate\`, \`object\`, \`depositTrust\`, ` +
      `\`chainId\`: "${CHAIN_ID}", \`description\`.\n\n` +
      `**Do not** replace this with \`cast\` calldata or shell tutorials unless they ask for CLI only.\n---`
    );
  }

  return '';
}
