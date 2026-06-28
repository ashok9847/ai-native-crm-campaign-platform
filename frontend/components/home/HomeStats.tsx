"use client";

/**
 * HomeStats — client component for home page live data.
 *
 * Shows two sections:
 *  1. Stats strip: total campaigns, distinct recipients reached, avg click rate
 *  2. Recent campaigns: last 3 campaigns as clickable cards
 *
 * Data source: GET /api/v1/campaigns (paginated)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCampaigns } from "@/lib/api";
import type { CampaignListItem, CampaignState } from "@/lib/types";

// ── State badge ───────────────────────────────────────────────────────────────

const STATE_STYLES: Record<
  CampaignState,
  { label: string; dot: string; text: string; bg: string }
> = {
  DRAFT:      { label: "Draft",      dot: "bg-slate-400",  text: "text-slate-400",  bg: "bg-slate-400/10 border-slate-400/20"  },
  SEGMENTING: { label: "Segmenting", dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/20"    },
  GENERATING: { label: "Generating", dot: "bg-violet-400", text: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20" },
  REVIEWING:  { label: "Review",     dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-400/10 border-amber-400/20"  },
  EXECUTING:  { label: "Live",       dot: "bg-emerald-400 animate-pulse", text: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  COMPLETE:   { label: "Complete",   dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  CANCELLED:  { label: "Cancelled",  dot: "bg-red-400",    text: "text-red-400",    bg: "bg-red-400/10 border-red-400/20"      },
};

function StateBadge({ state }: { state: CampaignState }) {
  const cfg = STATE_STYLES[state] ?? STATE_STYLES.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    let start = 0;
    const step = Math.ceil(value / 30);
    const timer = setInterval(() => {
      start = Math.min(start + step, value);
      setDisplay(start);
      if (start >= value) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="tabular-nums">
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeStats() {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCampaigns(1, 50)
      .then((r) => setCampaigns(r.items))
      .catch(() => {/* silently ignore — backend may not be running */})
      .finally(() => setLoading(false));
  }, []);

  const completed = campaigns.filter((c) => c.state === "COMPLETE");
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.segment_size, 0);
  const avgClickRate =
    completed.length > 0
      ? completed.reduce((sum, c) => sum + c.click_rate, 0) / completed.length
      : 0;

  const recent = campaigns.slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-4 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/4" />
          ))}
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-white/6 bg-white/2 p-8 text-center">
        <div className="text-3xl mb-3">🚀</div>
        <p className="text-slate-400 text-sm font-medium">No campaigns yet.</p>
        <p className="text-slate-600 text-xs mt-1">
          Create your first campaign to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Total Campaigns",
            value: campaigns.length,
            suffix: "",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            ),
            color: "violet",
          },
          {
            label: "Customers Reached",
            value: totalRecipients,
            suffix: "",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
            color: "emerald",
          },
          {
            label: "Avg Click Rate",
            value: Math.round(avgClickRate * 100),
            suffix: "%",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            ),
            color: "amber",
          },
        ].map((stat) => {
          const borderClass =
            stat.color === "violet"
              ? "border-violet-500/15 bg-violet-500/4"
              : stat.color === "emerald"
              ? "border-emerald-500/15 bg-emerald-500/4"
              : "border-amber-500/15 bg-amber-500/4";
          const iconClass =
            stat.color === "violet"
              ? "text-violet-400 bg-violet-500/10"
              : stat.color === "emerald"
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-amber-400 bg-amber-500/10";
          const valClass =
            stat.color === "violet"
              ? "text-violet-300"
              : stat.color === "emerald"
              ? "text-emerald-300"
              : "text-amber-300";

          return (
            <div
              key={stat.label}
              className={`rounded-2xl border ${borderClass} px-5 py-5 flex flex-col gap-3`}
            >
              <div className={`w-8 h-8 rounded-lg ${iconClass} flex items-center justify-center`}>
                {stat.icon}
              </div>
              <div>
                <div className={`text-2xl font-black ${valClass}`}>
                  <AnimatedNumber value={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-slate-500 text-xs mt-0.5 font-medium">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Recent campaigns ───────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
              Recent Campaigns
            </p>
            <Link
              href="/campaigns"
              className="text-xs text-violet-500 hover:text-violet-400 transition-colors font-medium"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {recent.map((c) => (
              <Link
                key={c.id}
                href={
                  c.state === "REVIEWING"
                    ? `/campaigns/${c.id}/review`
                    : c.state === "EXECUTING"
                    ? `/campaigns/${c.id}/tracker`
                    : c.state === "COMPLETE"
                    ? `/campaigns/${c.id}/results`
                    : `/campaigns`
                }
                className="group flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/6 bg-white/2 hover:bg-white/5 hover:border-white/10 transition-all duration-200"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-700/30 border border-violet-500/20 flex items-center justify-center text-violet-300 text-xs font-black shrink-0">
                  #{c.id}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-violet-200 transition-colors">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {c.segment_size} recipients
                    {c.click_rate > 0 && (
                      <> · <span className="text-amber-600">{Math.round(c.click_rate * 100)}% clicks</span></>
                    )}
                  </p>
                </div>

                {/* State badge */}
                <StateBadge state={c.state} />

                {/* Arrow */}
                <svg
                  className="w-4 h-4 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
