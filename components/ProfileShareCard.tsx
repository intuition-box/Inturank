import { useCallback, useRef, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Download, Twitter, Loader2, Copy } from 'lucide-react';
import html2canvas from 'html2canvas';
import Logo from './Logo';
import { CurrencySymbol } from './CurrencySymbol';
import { ArenaXpToken } from './ArenaXpToken';
import { toast } from './Toast';

const THEME = '#00f3ff';

export interface ProfileShareMixSlice {
  name: string;
  value: number;
  color: string;
}

interface ProfileShareCardProps {
  displayHeadline: string;
  maskedAddress: string;
  /** Full URL for tweet intent (clickable link). */
  profileUrlAbsolute: string;
  avatarSrc: string;
  vaultTotal: string;
  transactionCount: number;
  trustPct: number;
  portfolioMix: ProfileShareMixSlice[];
  /** Activity XP from on-chain protocol actions (market buys, sends, claims, etc.). */
  protocolXpTotal: number;
  /** Arena XP from confirmed YES/NO ranks. Optional for back-compat. */
  arenaXpTotal?: number;
  traderStatusLabel: string;
}

async function captureCardToCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    backgroundColor: '#020308',
    scale: 3,
    useCORS: true,
    logging: false,
    allowTaint: true,
  });
}

/**
 * Neon export card — rendered inside the profile share modal (MarketDetail-style).
 * Actions below the card: X, copy image, PNG download.
 */
export default function ProfileShareCard({
  displayHeadline,
  maskedAddress,
  profileUrlAbsolute,
  avatarSrc,
  vaultTotal,
  transactionCount,
  trustPct,
  portfolioMix,
  protocolXpTotal,
  arenaXpTotal = 0,
  traderStatusLabel,
}: ProfileShareCardProps) {
  /** Single source of truth for the IntuRank XP number — Arena ranks + Activity protocol XP. */
  const totalIntuRankXp = Math.max(0, Math.round((arenaXpTotal || 0) + (protocolXpTotal || 0)));
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const busy = isSaving || isCopying;

  const glowStyle = {
    boxShadow: `0 0 40px ${THEME}33, inset 0 0 20px ${THEME}1a`,
    borderColor: `${THEME}cc`,
  };

  const txLabel = transactionCount >= 100 ? `${transactionCount}+` : String(transactionCount);

  const handleShareToX = () => {
    const text = `My Intuition profile on IntuRank — ${displayHeadline} (${maskedAddress})\n\n${profileUrlAbsolute}\n\nSemantic reputation on @IntuitionSys`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  const runCapture = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await captureCardToCanvas(cardRef.current);
    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  }, []);

  const handleSave = async () => {
    if (!cardRef.current) return;
    setIsSaving(true);
    try {
      const canvas = await captureCardToCanvas(cardRef.current);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `inturank-profile-${maskedAddress.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}.png`;
      link.click();
      toast.success('Profile card saved');
    } catch (err) {
      console.error(err);
      toast.error('Could not export image');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    if (!navigator.clipboard?.write) {
      toast.error('Copy image is not supported in this browser');
      return;
    }
    setIsCopying(true);
    try {
      const blob = await runCapture();
      if (!blob) throw new Error('empty canvas');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast.success('Image copied — paste into X, Discord, etc.');
    } catch (err) {
      console.error(err);
      toast.error('Could not copy image');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 items-stretch w-full max-w-3xl mx-auto">
      <div className="w-full perspective-1000">
        <div
          ref={cardRef}
          className="relative bg-[#020308] border-2 p-6 sm:p-9 rounded-[2rem] overflow-hidden"
          style={glowStyle}
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none" />
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 0%, ${THEME}, transparent 70%)` }}
          />
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="flex justify-between items-start gap-4 mb-6 relative z-10">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
              <div
                className="w-14 h-14 shrink-0 bg-black border-2 flex items-center justify-center rounded-[1rem] overflow-hidden shadow-2xl"
                style={{ borderColor: `${THEME}88`, boxShadow: `0 0 20px ${THEME}44` }}
              >
                <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-white font-bold font-display text-lg sm:text-xl leading-snug tracking-tight break-words">
                  {displayHeadline}
                </p>
                <p className="mt-1 font-mono text-[11px] sm:text-xs font-semibold text-intuition-primary/90 tracking-wide">
                  {maskedAddress}
                </p>
                <p className="mt-2 font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300 antialiased [text-rendering:geometricPrecision]">
                  Trader profile
                </p>
                <p className="mt-2">
                  <span className="inline-flex items-center rounded-full border border-intuition-primary/45 bg-intuition-primary/10 px-3 py-1 font-sans text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-intuition-primary shadow-[0_0_16px_rgba(0,243,255,0.12)] antialiased [text-rendering:geometricPrecision]">
                    {traderStatusLabel}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2.5 sm:gap-3 text-right">
              <Logo className="w-11 h-11 sm:w-14 sm:h-14 shrink-0" style={{ filter: `drop-shadow(0 0 6px ${THEME})` }} />
              <div className="min-w-0 max-w-[10rem] sm:max-w-[12rem] pt-0.5 text-right">
                <p className="text-white font-black font-display tracking-[0.12em] text-sm sm:text-base leading-tight">
                  INTU<span style={{ color: THEME }}>RANK</span>
                </p>
              </div>
            </div>
          </div>

          <div
            className="grid grid-cols-3 gap-2 sm:gap-4 py-5 border-y mb-5 relative z-10 rounded-2xl bg-white/[0.02]"
            style={{ borderColor: `${THEME}22` }}
          >
            <div className="text-center min-w-0">
              <div className="text-[9px] sm:text-[10px] font-bold font-mono text-slate-300 uppercase tracking-[0.12em] mb-1.5 antialiased [text-rendering:geometricPrecision]">
                Trxns
              </div>
              <div className="text-white font-black text-sm sm:text-base tabular-nums">{txLabel}</div>
              <div className="text-[9px] sm:text-[10px] font-semibold font-mono text-slate-400 uppercase mt-1 tracking-wide antialiased">
                all-time
              </div>
            </div>
            <div className="text-center min-w-0 border-x border-white/[0.06]">
              <div className="text-[9px] sm:text-[10px] font-bold font-mono text-slate-300 uppercase tracking-[0.12em] mb-1.5 antialiased [text-rendering:geometricPrecision]">
                Vaults
              </div>
              <div className="text-white font-black text-sm sm:text-base inline-flex items-baseline justify-center gap-0.5 tabular-nums">
                <CurrencySymbol size="sm" className="text-intuition-primary shrink-0" />
                <span className="truncate">{vaultTotal}</span>
              </div>
              <div className="text-[9px] sm:text-[10px] font-semibold font-mono text-slate-400 uppercase mt-1 tracking-wide antialiased">
                TRUST
              </div>
            </div>
            <div className="text-center min-w-0">
              <div className="text-[9px] sm:text-[10px] font-bold font-mono text-slate-300 uppercase tracking-[0.12em] mb-1.5 antialiased [text-rendering:geometricPrecision]">
                Trust
              </div>
              <div className="text-intuition-success font-black text-sm sm:text-base tabular-nums">
                {trustPct.toFixed(0)}%
              </div>
              <div className="text-[9px] sm:text-[10px] font-semibold font-mono text-slate-400 uppercase mt-1 tracking-wide antialiased">
                bias
              </div>
            </div>
          </div>

          <div
            className="relative z-10 mb-5 flex items-center gap-4 rounded-2xl border px-4 py-4 sm:px-5 sm:py-4"
            style={{ borderColor: `${THEME}33`, background: 'rgba(0,243,255,0.04)' }}
          >
            <ArenaXpToken size={48} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] font-bold font-mono uppercase tracking-[0.18em] text-slate-300 antialiased [text-rendering:geometricPrecision]">
                IntuRank XP
              </p>
              <p className="mt-1 font-display text-2xl sm:text-3xl font-black tabular-nums text-white tracking-tight">
                {totalIntuRankXp.toLocaleString()}
              </p>
              {arenaXpTotal > 0 || protocolXpTotal > 0 ? (
                <p className="mt-1 font-mono text-[10px] sm:text-[11px] font-semibold text-slate-400 antialiased [text-rendering:geometricPrecision]">
                  <span className="text-intuition-primary/85">Arena {arenaXpTotal.toLocaleString()}</span>
                  <span className="text-slate-600 mx-1.5">·</span>
                  <span className="text-amber-300/85">Activity {protocolXpTotal.toLocaleString()}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="relative z-10 rounded-2xl border border-white/[0.08] bg-black/40 px-3 py-3 sm:px-5 sm:py-5">
            <div className="text-[10px] sm:text-[11px] font-bold font-mono text-slate-200 uppercase tracking-[0.2em] mb-2 antialiased [text-rendering:geometricPrecision]">
              Portfolio mix
            </div>
            <p className="text-[11px] sm:text-xs font-semibold font-sans text-slate-400 mb-4 leading-relaxed antialiased [text-rendering:geometricPrecision] inline-flex flex-wrap items-center gap-x-1 gap-y-1">
              <span>Share of</span>
              <CurrencySymbol size="sm" className="!ml-0 !mr-0 shrink-0 text-intuition-primary" />
              <span>by category</span>
            </p>
            {portfolioMix.length > 0 ? (
              <div className="grid grid-cols-1 min-[480px]:grid-cols-[150px_minmax(0,1fr)] gap-5 items-center">
                <div className="mx-auto h-[150px] w-[150px] min-[480px]:mx-0 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <Pie
                        data={portfolioMix.map(({ name, value }) => ({ name, value }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="48%"
                        outerRadius="78%"
                        paddingAngle={1}
                        startAngle={90}
                        endAngle={-270}
                        stroke="#05070c"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {portfolioMix.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2 min-w-0">
                  {portfolioMix.map((row) => (
                    <li key={row.name} className="flex items-center gap-2.5 text-[11px] sm:text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/20 shadow-sm"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-sans font-semibold text-[12px] sm:text-sm text-slate-100 uppercase tracking-tight antialiased [text-rendering:geometricPrecision]">
                        {row.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-white">{row.value.toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs font-sans font-medium text-slate-400 leading-relaxed antialiased [text-rendering:geometricPrecision]">
                No category breakdown yet — open a position to populate mix.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full relative z-[110]">
        <button
          type="button"
          onClick={handleShareToX}
          disabled={busy}
          className="py-3.5 bg-white/5 border border-white/10 text-white font-black font-mono text-[9px] tracking-[0.2em] uppercase hover:bg-white hover:text-black transition-all rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
        >
          <Twitter size={14} /> Post on X
        </button>
        <button
          type="button"
          onClick={handleCopyImage}
          disabled={busy}
          className="py-3.5 bg-white/5 border border-white/10 text-white font-black font-mono text-[9px] tracking-[0.2em] uppercase hover:border-intuition-primary hover:text-intuition-primary transition-all rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
        >
          {isCopying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Copy image
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="py-3.5 font-black font-mono text-[9px] tracking-[0.2em] uppercase rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
          style={{
            backgroundColor: THEME,
            color: '#000',
            boxShadow: `0 0 24px ${THEME}66`,
          }}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download PNG
        </button>
      </div>
    </div>
  );
}
