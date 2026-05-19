import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageIcon, Plus, ShieldCheck, X } from 'lucide-react';
import type { RankItem } from '../../pages/RankedList';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import {
  ARENA_CARD_SURFACE,
  ARENA_SHADOWS,
  deckPalette,
  type DeckPaletteEntry,
} from '../../services/arenaCardDesign';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Drives the contest's solid color theme. */
  listCategory?: string;
  /** Contest title shown in the dialog header (context for the user). */
  listTitle?: string;
  /** Existing deck item ids/labels for de-dup. */
  existingItems: Pick<RankItem, 'id' | 'label'>[];
  /** Caller appends the new card to the deck. */
  onSubmit: (item: RankItem) => void;
};

const MAX_LABEL = 60;
const MAX_SUBTITLE = 80;
const HTTP_URL_RE = /^https?:\/\/[\w.-]+(\:\d+)?(\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?$/i;
/**
 * Cards added during Curate/Rank get a `pending-card-…` id (session-local deck
 * placeholder). Compare signing handles contest promotion + queued rank stakes;
 * atom mint for user-created rows is not wired into that batch yet.
 */
const PENDING_ID_PREFIX = 'pending-card-';

function makePendingCardId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${PENDING_ID_PREFIX}${Date.now().toString(36)}-${rand}`;
}

/**
 * Local-only "create a new card" modal.
 *
 * The Arena flow keeps this modal wallet-free: promotion + queued rank stakes are
 * submitted when you reach Compare and sign there; Create Card rows stay local until atom mint ships.
 * This modal validates the input, builds a `RankItem` with a `pending-card-…` id, and hands it
 * back for ranking UX only — no wallet calls from this modal.
 */
export const ArenaCreateCardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  listCategory,
  listTitle,
  existingItems,
  onSubmit,
}) => {
  const palette = useMemo(() => deckPalette(listCategory), [listCategory]);
  const [label, setLabel] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [image, setImage] = useState('');
  const [touched, setTouched] = useState(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  /** Reset state on (re)open. */
  useEffect(() => {
    if (!isOpen) return;
    setLabel('');
    setSubtitle('');
    setImage('');
    setTouched(false);
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, [isOpen]);

  /** Close on Escape. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const error = useMemo(
    () => validate({ label, image, existingItems }),
    [label, image, existingItems],
  );
  const formValid = !error;

  const handleSubmit = () => {
    if (!formValid) {
      setTouched(true);
      return;
    }
    playArenaUiClick();
    const item: RankItem = {
      id: makePendingCardId(),
      kind: 'atom',
      label: label.trim(),
      pairKind: 'user',
      ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
      ...(image.trim() ? { image: image.trim() } : {}),
    };
    onSubmit(item);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          aria-modal
          role="dialog"
          aria-labelledby="arena-create-card-title"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ scale: 0.96, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: palette.line,
              boxShadow: ARENA_SHADOWS.cardLifted,
            }}
          >
            <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: palette.hex }} aria-hidden />

            <header
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: palette.hex, color: palette.contrastText }}
            >
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] opacity-80">
                  {palette.label} · Add to deck
                </p>
                <h2
                  id="arena-create-card-title"
                  className="font-display text-base font-black uppercase tracking-tight"
                >
                  Create a new card
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  playArenaUiClick();
                  onClose();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md transition-[background]"
                style={{ background: 'rgba(0,0,0,0.18)', color: palette.contrastText }}
              >
                <X className="h-4 w-4" strokeWidth={2.6} aria-hidden />
              </button>
            </header>

            <FormBody
              palette={palette}
              listTitle={listTitle}
              label={label}
              setLabel={setLabel}
              subtitle={subtitle}
              setSubtitle={setSubtitle}
              image={image}
              setImage={setImage}
              touched={touched}
              error={error}
              formValid={formValid}
              labelInputRef={labelInputRef}
              onBlur={() => setTouched(true)}
              onCancel={() => {
                playArenaUiClick();
                onClose();
              }}
              onSubmit={() => {
                playArenaUiHover();
                handleSubmit();
              }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

/* ============================== Form ============================== */

type FormProps = {
  palette: DeckPaletteEntry;
  listTitle?: string;
  label: string;
  setLabel: (v: string) => void;
  subtitle: string;
  setSubtitle: (v: string) => void;
  image: string;
  setImage: (v: string) => void;
  touched: boolean;
  error: ValidationError | null;
  formValid: boolean;
  labelInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onBlur: () => void;
  onCancel: () => void;
  onSubmit: () => void;
};

const FormBody: React.FC<FormProps> = ({
  palette,
  listTitle,
  label,
  setLabel,
  subtitle,
  setSubtitle,
  image,
  setImage,
  touched,
  error,
  formValid,
  labelInputRef,
  onBlur,
  onCancel,
  onSubmit,
}) => (
  <div className="px-5 py-5">
    {listTitle ? (
      <p className="text-[12px] leading-relaxed text-slate-400">
        Adds the card to your <span className="font-semibold text-slate-200">{listTitle}</span> deck. Sort and
        stake it like any other card.
      </p>
    ) : null}

    <div
      className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5"
      style={{
        borderColor: ARENA_CARD_SURFACE.edgeMuted,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <span
        className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: palette.soft, color: palette.hex }}
        aria-hidden
      >
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
      </span>
      <p className="text-[11px] leading-snug text-slate-400">
        Cards stay in your deck only until you reach Compare. <span className="font-semibold text-slate-200">All on-chain writes happen in one wallet sign at the end</span> — no upfront cost for adding a card.
      </p>
    </div>

    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Field
        label="Item name"
        required
        hint={`${label.length}/${MAX_LABEL}`}
        error={touched && error?.field === 'label' ? error.message : null}
      >
        <input
          ref={labelInputRef}
          type="text"
          placeholder="e.g. Sophia"
          maxLength={MAX_LABEL}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={onBlur}
          className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5 text-[13px] font-semibold text-white placeholder:text-slate-600 focus:border-white/22 focus:outline-none focus:ring-1 focus:ring-white/15"
        />
      </Field>

      <Field label="Subtitle" hint={`${subtitle.length}/${MAX_SUBTITLE} · optional`}>
        <input
          type="text"
          placeholder="e.g. Ecosystem · community lead"
          maxLength={MAX_SUBTITLE}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-white/22 focus:outline-none focus:ring-1 focus:ring-white/15"
        />
      </Field>

      <Field
        label="Image URL"
        hint="optional · http(s)://"
        error={touched && error?.field === 'image' ? error.message : null}
      >
        <div className="flex items-stretch gap-2">
          <span
            className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[#070a10]"
            style={{ borderColor: palette.line }}
            aria-hidden
          >
            {image.trim() && HTTP_URL_RE.test(image.trim()) ? (
              <img src={image.trim()} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-slate-700" strokeWidth={1.6} />
            )}
          </span>
          <input
            type="url"
            placeholder="https://…/avatar.png"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5 font-mono text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-white/22 focus:outline-none focus:ring-1 focus:ring-white/15"
          />
        </div>
      </Field>

      <footer className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/12 bg-black/30 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!formValid}
          className="group inline-flex flex-[1.4] items-center justify-center gap-2 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
          style={{ background: palette.hex, color: palette.contrastText }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden />
          Add to deck
        </button>
      </footer>

      {touched && error && !error.field ? (
        <p className="text-[11px] text-rose-300">{error.message}</p>
      ) : null}
    </form>
  </div>
);

/* ============================== Atoms ============================== */

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}> = ({ label, required, hint, error, children }) => (
  <div>
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
        {required ? <span className="ml-1 text-rose-400">*</span> : null}
      </label>
      {hint ? <span className="font-mono text-[10px] text-slate-600">{hint}</span> : null}
    </div>
    {children}
    {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : null}
  </div>
);

/* ============================== Validation ============================== */

type ValidationError = { field?: 'label' | 'image'; message: string };

function validate({
  label,
  image,
  existingItems,
}: {
  label: string;
  image: string;
  existingItems: Pick<RankItem, 'id' | 'label'>[];
}): ValidationError | null {
  const trimmed = label.trim();
  if (!trimmed) return { field: 'label', message: 'Name is required.' };
  if (trimmed.length < 2) return { field: 'label', message: 'Use at least 2 characters.' };
  const lower = trimmed.toLowerCase();
  if (existingItems.some((it) => it.label.trim().toLowerCase() === lower)) {
    return { field: 'label', message: 'A card with this name is already in your deck.' };
  }
  const imgTrim = image.trim();
  if (imgTrim && !HTTP_URL_RE.test(imgTrim)) {
    return { field: 'image', message: 'Use a valid http(s) URL or leave empty.' };
  }
  return null;
}

/* ============================== Exports for callers ============================== */

/** Helper for callers that need to know whether a `RankItem` is still pending on-chain. */
export function isPendingArenaCardId(id: string): boolean {
  return id.startsWith(PENDING_ID_PREFIX);
}
