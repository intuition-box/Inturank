import React from 'react';

/**
 * Arena XP mark — restrained cyan (+slate) bezel, glazed core.
 * Keeps IntuRank read without rainbow segments.
 */
export function ArenaXpToken({
  className = '',
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  const uid = React.useId().replace(/:/g, '');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`shrink-0 drop-shadow-[0_0_10px_rgba(34,211,238,0.22)] ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <radialGradient id={`${uid}-glass`} cx="42%" cy="32%" r="68%">
          <stop offset="0%" stopColor="rgba(207,250,254,0.2)" />
          <stop offset="55%" stopColor="rgba(8,51,68,0.65)" />
          <stop offset="100%" stopColor="rgba(2,11,18,0.95)" />
        </radialGradient>
      </defs>

      <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(103,232,249,0.12)" strokeWidth="2" />

      <circle cx="20" cy="20" r="16.75" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="2.1" />

      <circle cx="20" cy="20" r="12.95" fill={`url(#${uid}-glass)`} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />

      {/* Subtle tiers — monochrome cyan */}
      <g opacity={0.55}>
        <rect x="13.85" y="14.2" width="3.1" height="4.6" rx={0.4} fill="#22d3ee" />
        <rect x={18.45} y={15.35} width="3.1" height="3.45" rx={0.4} fill="#22d3ee" />
        <rect x="23.05" y="14.55" width="3.1" height="4.25" rx={0.4} fill="#22d3ee" />
      </g>

      <text
        x="20"
        y="30.85"
        textAnchor="middle"
        fill="#cffafe"
        fontSize="9.75"
        fontWeight={600}
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="0.07em"
        opacity={0.95}
      >
        XP
      </text>

      <ellipse
        cx="14.75"
        cy="13.95"
        rx="5"
        ry="2.5"
        fill="rgba(255,255,255,0.1)"
        transform="rotate(-35 14.75 13.95)"
      />
    </svg>
  );
}
