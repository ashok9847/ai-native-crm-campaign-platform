"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelCampaign } from "@/lib/api";
import type { CampaignListItem } from "@/lib/types";
import { Search, MoreVertical, Calendar, AlertTriangle } from "lucide-react";

interface CampaignTableProps {
  campaigns: CampaignListItem[];
  onRefresh?: () => void;
}

const STATE_BADGES: Record<string, string> = {
  DRAFT: "badge-pending",
  SEGMENTING: "badge-running",
  GENERATING: "badge-running",
  REVIEWING: "badge-amber",
  EXECUTING: "badge-running animate-pulse",
  COMPLETE: "badge-success",
  CANCELLED: "badge-failed",
};

const STATE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SEGMENTING: "Segmenting",
  GENERATING: "Generating",
  REVIEWING: "Reviewing",
  EXECUTING: "Executing",
  COMPLETE: "Complete",
  CANCELLED: "Stopped",
};

function StateBadge({ state }: { state: string }) {
  const badgeClass = STATE_BADGES[state] ?? "badge-pending";
  const label = STATE_LABELS[state] ?? state;
  return (
    <span className={badgeClass}>
      {label}
    </span>
  );
}

function RateCell({ value }: { value: number }) {
  if (value === 0) return <span className="text-text-faint font-semibold">—</span>;
  const pct = Math.round(value * 100);
  const color =
    pct >= 50
      ? "text-green font-extrabold"
      : pct >= 25
      ? "text-amber font-extrabold"
      : "text-text-muted font-bold";
  return <span className={`text-xs font-bold tabular-nums ${color}`}>{pct}%</span>;
}

export default function CampaignTable({ campaigns, onRefresh }: CampaignTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesChannel = channelFilter === "all" || c.channel === channelFilter;
    return matchesSearch && matchesChannel;
  });

  const handleStopCampaign = async (id: number, name: string) => {
    if (confirm(`Are you sure you want to stop campaign "${name}"?`)) {
      try {
        await cancelCampaign(id);
        if (onRefresh) onRefresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to stop campaign");
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch justify-between bg-surface rounded-[18px] p-4 border-none shadow-none">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns by name..."
            className="global-input pl-10 h-11"
          />
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-text-faint" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-pill p-1 border-none shadow-none">
            {["all", "sms", "whatsapp", "email", "rcs"].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`px-3.5 h-8 rounded-pill text-xs font-bold uppercase transition-all border-none cursor-pointer flex items-center justify-center ${
                  channelFilter === ch
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text bg-transparent"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table container */}
      <div className="rounded-[18px] bg-surface overflow-hidden border-none shadow-none">
        <div className="overflow-x-auto">
          <table className="global-table">
            <thead className="global-table-thead">
              <tr>
                <th className="global-table-th">Campaign</th>
                <th className="global-table-th">Status</th>
                <th className="global-table-th">Created</th>
                <th className="global-table-th text-right">Size</th>
                <th className="global-table-th text-right">Open</th>
                <th className="global-table-th text-right">Click</th>
                <th className="global-table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.length > 0 ? (
                filteredCampaigns.map((c) => {
                  let campaignUrl = `/campaigns/${c.id}`;
                  if (c.state === "COMPLETE") {
                    campaignUrl = `/campaigns/${c.id}/results`;
                  } else if (c.state === "EXECUTING" || c.state === "CANCELLED") {
                    campaignUrl = `/campaigns/${c.id}/tracker`;
                  } else if (c.state === "REVIEWING") {
                    campaignUrl = `/campaigns/${c.id}/review`;
                  }

                  return (
                    <tr
                      key={c.id}
                      className="global-table-tr cursor-pointer"
                      onClick={() => router.push(campaignUrl)}
                    >
                      {/* Name */}
                      <td className="global-table-td max-w-[280px]">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-text truncate">
                              {c.name}
                            </p>
                            <span className="badge-pending text-xs px-2 py-0.5 font-bold uppercase tracking-wider shrink-0">
                              {c.channel || "sms"}
                            </span>
                          </div>
                          {c.stalled_at && (
                            <p className="text-xs text-red mt-1 font-bold uppercase tracking-wider flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Stalled
                            </p>
                          )}
                          {c.scheduled_at && c.state === "DRAFT" && (
                            <p className="text-xs text-accent mt-1 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 shrink-0" /> Scheduled: {new Date(c.scheduled_at).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* State */}
                      <td className="global-table-td">
                        <StateBadge state={c.state} />
                      </td>

                      {/* Date */}
                      <td className="global-table-td text-xs text-text-muted tabular-nums">
                        {new Date(c.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Segment size */}
                      <td className="global-table-td text-xs text-text font-bold text-right tabular-nums">
                        {c.segment_size > 0 ? c.segment_size.toLocaleString() : "—"}
                      </td>

                      {/* Open rate */}
                      <td className="global-table-td text-right">
                        <RateCell value={c.open_rate} />
                      </td>

                      {/* Click rate */}
                      <td className="global-table-td text-right">
                        <RateCell value={c.click_rate} />
                      </td>

                      {/* Actions kebab */}
                      <td className="global-table-td text-right relative" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-block text-left">
                          <button
                            onClick={() => setActiveMenuId(activeMenuId === c.id ? null : c.id)}
                            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors border-none shadow-none cursor-pointer h-10 w-10 flex items-center justify-center"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                          
                          {activeMenuId === c.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setActiveMenuId(null)}
                              />
                              <div className="absolute right-0 mt-1.5 w-40 rounded-[18px] border border-border bg-white p-2 shadow-lg z-20">
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    router.push(campaignUrl);
                                  }}
                                  className="block text-left w-full px-3 py-2 rounded-pill text-xs font-bold text-text-muted hover:bg-surface-hover hover:text-text transition-colors border-none cursor-pointer h-8"
                                >
                                  View Details
                                </button>
                                {(c.state === "EXECUTING" || c.state === "REVIEWING") && (
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      handleStopCampaign(c.id, c.name);
                                    }}
                                    className="block text-left w-full px-3 py-2 rounded-pill text-xs font-bold text-red hover:bg-red-light transition-colors border-none cursor-pointer h-8"
                                  >
                                    Stop Campaign
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted font-bold uppercase tracking-wider text-xs">
                    No campaigns found matching search/filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
