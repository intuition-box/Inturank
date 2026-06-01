import React from 'react';
import { Link } from 'react-router-dom';
import { playClick } from '../services/audio';

export type PageLoadingBackLink = { to: string; label: string };

type SpinnerSize = 'sm' | 'md';

const spinnerClass = (size: SpinnerSize) =>
  size === 'sm'
    ? 'w-8 h-8 rounded-xl border-2 border-intuition-primary/40 border-t-intuition-primary animate-spin shrink-0'
    : 'w-12 h-12 rounded-2xl border-2 border-intuition-primary/40 border-t-intuition-primary animate-spin shrink-0';

/**
 * Rounded-square cyan spinner used across the app (matches market detail loading).
 */
export function PageLoadingSpinner({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) {
  return <div className={`${spinnerClass(size)} ${className}`.trim()} aria-hidden />;
}

export type PageLoadingProps = {
  /** Primary status line */
  message?: string;
  /** Optional second line (smaller, muted) */
  subMessage?: string;
  /**
   * Bottom navigation link. Pass `null` to hide. If omitted, defaults to “Back to markets” for fullscreen only.
   */
  backLink?: PageLoadingBackLink | null;
  /** Full viewport vs embedded panel */
  variant?: 'fullscreen' | 'section';
  /** Extra classes on outer wrapper (e.g. `absolute inset-0`, `min-h-[500px]`) */
  className?: string;
};

/**
 * Full-screen or section loading state: tilted-square spinner, sans message, optional back link.
 */
export function PageLoading({
  message = 'Loading…',
  subMessage,
  backLink,
  variant = 'fullscreen',
  className = '',
}: PageLoadingProps) {
  const resolvedBack: PageLoadingBackLink | null =
    backLink !== undefined ? backLink : variant === 'fullscreen' ? { to: '/markets/atoms', label: 'Back to markets' } : null;

  const inner = (
    <>
      <PageLoadingSpinner size="md" />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-slate-300 font-sans max-w-sm">{message}</p>
        {subMessage ? <p className="text-xs text-slate-500 font-sans max-w-md">{subMessage}</p> : null}
      </div>
      {resolvedBack ? (
        <Link
          to={resolvedBack.to}
          onClick={playClick}
          className="text-xs text-slate-500 hover:text-intuition-primary font-sans transition-colors"
        >
          ← {resolvedBack.label}
        </Link>
      ) : null}
    </>
  );

  const base =
    variant === 'fullscreen'
      ? `min-h-screen flex flex-col items-center justify-center gap-6 bg-intuition-dark px-6 ${className}`
      : `flex flex-col items-center justify-center gap-6 px-6 ${className}`;

  return (
    <div role="status" aria-busy="true" aria-label={message} className={base.trim()}>
      {inner}
    </div>
  );
}
