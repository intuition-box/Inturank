/**
 * Gamified profile widget for header — avatar, badge, link to full profile
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Crown, Medal, Award, ChevronDown } from 'lucide-react';
import { useUserBadges } from '../hooks/useUserBadges';
import { BADGE_NAMES, type BadgeTier } from '../services/badges';
import { playClick, playHover } from '../services/audio';
import { useWalletDisplayMeta } from '../hooks/useWalletDisplayMeta';
import { DEFAULT_PROFILE_AVATAR_URL } from '../constants';
import { formatWalletHeadlineForUi } from '../services/analytics';

interface ProfileBadgeWidgetProps {
  address: string;
  isDropdownOpen: boolean;
  onToggleDropdown: () => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  onDisconnect?: () => void;
  children?: React.ReactNode; // dropdown content (links, disconnect, etc.)
}

const BADGE_ICONS: Record<BadgeTier, React.ReactNode> = {
  apex: <Crown size={10} strokeWidth={2} />,
  elite: <Medal size={10} strokeWidth={2} />,
  rising: <Medal size={10} strokeWidth={2} />,
  scout: <Award size={10} strokeWidth={2} />,
};

const BADGE_STYLES: Record<BadgeTier, string> = {
  apex: 'from-amber-400/40 to-amber-600/30 border-amber-400/60 text-amber-300',
  elite: 'from-slate-300/30 to-slate-500/20 border-slate-400/50 text-slate-200',
  rising: 'from-amber-700/30 to-amber-900/20 border-amber-600/50 text-amber-200',
  scout: 'from-slate-600/20 to-slate-800/10 border-slate-500/40 text-slate-400',
};

const ProfileBadgeWidget: React.FC<ProfileBadgeWidgetProps> = ({
  address,
  isDropdownOpen,
  onToggleDropdown,
  dropdownRef,
  children,
}) => {
  const { badges } = useUserBadges(address);
  const head = useWalletDisplayMeta(address);
  const displayName = formatWalletHeadlineForUi(head, address);

  const tier = badges?.bestTier ?? 'scout';

  return (
    <div className="relative z-[1] overflow-visible" ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggleDropdown}
        onMouseEnter={playHover}
        className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-full border border-intuition-primary/20 bg-black/35 hover:bg-intuition-primary/[0.06] hover:border-intuition-primary/40 hover:shadow-[0_0_18px_rgba(0,243,255,0.12)] transition-all group"
      >
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-full overflow-hidden ring-2 ring-inset ${
              tier === 'apex'
                ? 'ring-amber-400/50'
                : tier === 'elite'
                  ? 'ring-slate-400/45'
                  : tier === 'rising'
                    ? 'ring-amber-600/45'
                    : 'ring-intuition-primary/25'
            }`}
          >
            <img
              src={DEFAULT_PROFILE_AVATAR_URL}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-black/40 flex items-center justify-center bg-gradient-to-br shadow-md ${BADGE_STYLES[tier]}`}
          >
            {BADGE_ICONS[tier]}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-start justify-center min-w-0 gap-0.5 max-w-[150px]">
          <span className="text-white font-semibold text-xs leading-tight truncate font-sans tabular-nums">{displayName}</span>
          <span
            className={`text-[10px] font-medium font-sans leading-tight truncate ${
              tier === 'apex'
                ? 'text-amber-400/90'
                : tier === 'elite'
                  ? 'text-slate-400'
                  : tier === 'rising'
                    ? 'text-amber-500/90'
                    : 'text-slate-500'
            }`}
          >
            {BADGE_NAMES[tier]}
          </span>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`text-intuition-primary/60 shrink-0 transition-transform duration-200 group-hover:text-intuition-primary ${isDropdownOpen ? 'rotate-180 text-intuition-primary' : ''}`}
          aria-hidden
        />
      </button>

      {isDropdownOpen && children}
    </div>
  );
};

export default ProfileBadgeWidget;
