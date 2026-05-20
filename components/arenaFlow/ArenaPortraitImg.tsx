import React, { useEffect, useState } from 'react';
import { normalizeWebMediaUrl } from '../../services/mediaUrl';

type Props = {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
  fetchPriority?: 'high' | 'low' | 'auto';
  draggable?: boolean;
  children?: React.ReactNode;
};

/**
 * `<img>` for arena identity art: resolves ipfs/ar URLs and hides broken loads so parents can show initials / silhouette.
 */
export const ArenaPortraitImg: React.FC<Props> = ({
  src,
  alt = '',
  className,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  draggable = false,
  children,
}) => {
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setBad(false);
  }, [src]);
  const normalized = normalizeWebMediaUrl(src);
  if (!normalized || bad) return <>{children ?? null}</>;
  /* Use DOM attribute `fetchpriority` (lowercase); React warns when camelCase `fetchPriority` is passed through. */
  return (
    <img
      src={normalized}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
      {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
      onError={() => setBad(true)}
    />
  );
};
