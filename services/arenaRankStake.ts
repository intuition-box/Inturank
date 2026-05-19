import type { ArenaPendingRow } from './arenaPendingBatch';

/** Parse stake base label (e.g. "0.1") to a number for ordering; invalid → 0. */
export function parseStakeBaseLabel(label: string): number {
  const n = parseFloat(String(label).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function effectiveTrustAmount(base: number, units: number): number {
  if (base <= 0 || units < 1) return 0;
  return base * units;
}

/**
 * Sort deck by descending on-chain weight (base × units). Higher stake ranks above.
 * Tie-break: preserve `orderIndex` (position in list before sort) for stability.
 */
export function sortRankItemsByEffectiveStake<T extends { id: string }>(
  items: T[],
  unitsById: Record<string, number>,
  base: number,
): T[] {
  if (items.length < 2) return [...items];
  const orderIndex = new Map<string, number>();
  items.forEach((it, i) => orderIndex.set(it.id, i));
  return [...items].sort((a, b) => {
    const ua = unitsById[a.id] ?? 1;
    const ub = unitsById[b.id] ?? 1;
    const wa = effectiveTrustAmount(base, ua);
    const wb = effectiveTrustAmount(base, ub);
    if (wb !== wa) return wb - wa;
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
  });
}

/**
 * Top-heavy stake units along drag order — rank #1 gets the largest weight.
 * Preserves approximate total units budget, clamped so every row stays in [minU, maxU]
 * and the sum never exceeds `n * maxU`.
 */
export function autoDistributeStakeUnitsAlongOrder<T extends { id: string }>(
  order: T[],
  prev: Record<string, number>,
  minU: number,
  maxU: number,
): Record<string, number> {
  const n = order.length;
  if (n === 0) return {};

  let S = 0;
  for (const it of order) {
    const raw = prev[it.id] ?? minU;
    S += Math.max(minU, Math.min(maxU, raw));
  }
  const maxSum = n * maxU;
  const minSum = n * minU;
  if (S > maxSum) S = maxSum;
  if (S < minSum) S = minSum;

  const weights = order.map((_, i) => n - i);
  const sumW = weights.reduce((a, b) => a + b, 0);

  const floats = weights.map((w) => (S * w) / sumW);
  let u = floats.map((x) => Math.max(minU, Math.min(maxU, Math.floor(x))));
  let sum = u.reduce((a, b) => a + b, 0);
  let diff = S - sum;

  let guard = 0;
  while (diff !== 0 && guard < 4096) {
    guard++;
    if (diff > 0) {
      let moved = false;
      for (let i = 0; i < n && diff > 0; i++) {
        if (u[i]! < maxU) {
          u[i]! += 1;
          diff--;
          moved = true;
        }
      }
      if (!moved) break;
    } else {
      let moved = false;
      for (let i = n - 1; i >= 0 && diff < 0; i--) {
        if (u[i]! > minU) {
          u[i]! -= 1;
          diff++;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  const out: Record<string, number> = {};
  order.forEach((it, i) => {
    out[it.id] = u[i]!;
  });
  return out;
}

/** Keep batch cart row order + units aligned with the rank deck. */
export function alignPendingRowsToDeck<T extends { id: string }>(
  deck: T[],
  rows: ArenaPendingRow[],
  units: Record<string, number>,
): ArenaPendingRow[] {
  if (deck.length === 0) return rows;
  const byId = new Map(rows.map((r) => [r.item.id, r] as const));
  const front: ArenaPendingRow[] = [];
  for (const it of deck) {
    const row = byId.get(it.id);
    if (!row) continue;
    const u = Math.max(1, Math.min(12, units[it.id] ?? row.units));
    front.push({ ...row, units: u });
  }
  const idSet = new Set(deck.map((d) => d.id));
  const rest = rows.filter((r) => !idSet.has(r.item.id));
  return [...front, ...rest];
}
