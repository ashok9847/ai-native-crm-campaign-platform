import React from "react";

type LogoSize = "sm" | "md" | "lg" | "xl";
type LogoMode = "dark" | "light" | "amber";

interface LogoProps {
  size?: LogoSize;
  mode?: LogoMode;
  showTagline?: boolean;
  className?: string;
}

const config = {
  sm: { wordmark: "text-[18px]", icon: "w-5.5 h-5.5", tagline: "text-[8px]", gap: "gap-[1px]", space: "gap-2" },
  md: { wordmark: "text-[22px]", icon: "w-7 h-7", tagline: "text-[9px]", gap: "gap-[2px]", space: "gap-2.5" },
  lg: { wordmark: "text-[30px]", icon: "w-9 h-9", tagline: "text-[10px]", gap: "gap-[3px]", space: "gap-3" },
  xl: { wordmark: "text-[44px]", icon: "w-13 h-13", tagline: "text-[12px]", gap: "gap-[4px]", space: "gap-4" },
};

const modeStyles = {
  dark: {
    wordmark: "text-[#0A0A0A]",
    tagline: "text-[#5E5E5E]",
    iconPrimary: "#0A0A0A",
    iconSecondary: "#F59E0B",
  },
  light: {
    wordmark: "text-white",
    tagline: "text-[#E5E5E5]",
    iconPrimary: "#FFFFFF",
    iconSecondary: "#F59E0B",
  },
  amber: {
    wordmark: "text-[#0A0A0A]",
    tagline: "text-[#92400E]",
    iconPrimary: "#F59E0B",
    iconSecondary: "#0A0A0A",
  },
};

export function Logo({
  size = "md",
  mode = "dark",
  showTagline = false,
  className = "",
}: LogoProps) {
  const s = config[size];
  const m = modeStyles[mode];

  return (
    <div className={`flex flex-col ${s.gap} ${className}`}>
      <div className={`flex items-center ${s.space} select-none`}>
        {/* Modern Brand Mark SVG */}
        <svg
          className={`${s.icon} shrink-0`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Overlapping intersecting rings representing targeted audience and delivery */}
          <circle
            cx="9"
            cy="12"
            r="6"
            stroke={m.iconPrimary}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="15"
            cy="12"
            r="6"
            stroke={m.iconSecondary}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 4"
          />
          <path
            d="M12 9V15"
            stroke={m.iconSecondary}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M9 12H15"
            stroke={m.iconPrimary}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Wordmark */}
        <span
          className={`font-black tracking-tight leading-none ${s.wordmark} ${m.wordmark}`}
          style={{ letterSpacing: "-0.05em" }}
        >
          nudge
        </span>
      </div>
      {showTagline && (
        <span
          className={`font-semibold uppercase tracking-[0.12em] leading-none ${s.tagline}`}
        >
          AI Campaign Copilot
        </span>
      )}
    </div>
  );
}

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#09090B"/>
  <circle cx="12" cy="16" r="8" stroke="white" stroke-width="3" fill="none"/>
  <circle cx="20" cy="16" r="8" stroke="#F59E0B" stroke-width="3" stroke-dasharray="4 3" fill="none"/>
</svg>`;

export default Logo;
