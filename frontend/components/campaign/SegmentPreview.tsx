"use client";

/**
 * SegmentPreview — shows matched customer count, tier chips, sample list.
 * T039: /components/campaign/SegmentPreview.tsx
 *
 * Features:
 * - Customer count badge with gradient
 * - Sample customer list (name + tier chips)
 * - AlertDialog warning when customer_count > 500 (large_segment_warning)
 * - "Review & Edit Messages" CTA → proceeds to review page
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { CampaignDetailResponse } from "@/lib/types";



interface SegmentPreviewProps {
  campaign: CampaignDetailResponse;
  onProceedToReview: () => void;
}

export default function SegmentPreview({
  campaign,
  onProceedToReview,
}: SegmentPreviewProps) {
  const [showLargeWarning, setShowLargeWarning] = useState(
    campaign.segment?.large_segment_warning ?? false
  );
  const [confirmed, setConfirmed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const segment = campaign.segment;
  if (!segment) return null;

  function handleProceed() {
    if (segment!.large_segment_warning && !confirmed) {
      setShowLargeWarning(true);
    } else {
      onProceedToReview();
    }
  }

  function handleConfirmLarge() {
    setConfirmed(true);
    setShowLargeWarning(false);
    onProceedToReview();
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Segment Created</h2>
              <p className="text-xs text-slate-400">{campaign.name}</p>
            </div>
          </div>

          {/* Count badge */}
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-2xl font-bold text-emerald-400">
              {segment.customer_count}
            </span>
            <span className="text-xs text-emerald-600 font-medium leading-tight">
              customers<br />matched
            </span>
          </div>
        </div>

        {/* Filter criteria */}
        {segment.filter_criteria.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-800/60">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
              Filters applied
            </p>
            <div className="flex flex-wrap gap-2">
              {segment.filter_criteria.map((f, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/50 text-xs text-slate-300 font-mono"
                >
                  {f.field} {f.operator} {Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sample customers */}
        {segment.sample_customers.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-800/60">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-medium">
              Sample customers
            </p>
            <div className="space-y-2">
              {segment.sample_customers.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <span className="text-slate-300 font-medium">{c.name}</span>
                  <span className="text-slate-600 text-xs">{c.email}</span>
                </div>
              ))}
              {segment.customer_count > 5 && (
                <p className="text-xs text-slate-500 pl-10">
                  and {segment.customer_count - 5} more…
                </p>
              )}
            </div>
          </div>
        )}

        {/* Messages preview summary */}
        {campaign.messages.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-800/60">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-slate-400">
                <span className="text-violet-400 font-semibold">{campaign.messages.length} personalized messages</span> generated and ready to review
              </p>
            </div>
            <p className="text-xs text-slate-500 pl-5 leading-relaxed line-clamp-2">
              Preview: &ldquo;{campaign.messages[0]?.effective_body?.slice(0, 120)}…&rdquo;
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            State: <span className="font-mono text-emerald-400">{campaign.state}</span>
          </p>
          <button
            id="segment-proceed-btn"
            onClick={handleProceed}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-violet-900/30"
          >
            Review Messages
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Large segment AlertDialog */}
      {showLargeWarning && !confirmed && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[18px] p-6 max-w-md w-full mx-4 shadow-xl space-y-4 border-none text-text">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-light flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-sm font-extrabold text-text tracking-tight">Large Segment Warning</h3>
            </div>
            <p className="text-text-muted text-xs font-medium leading-relaxed">
              This segment targets <strong className="text-text font-bold">{segment.customer_count} customers</strong> — which is above the recommended limit of 500.
            </p>
            <p className="text-text-faint text-xs font-bold uppercase tracking-wider">
              Sending to a very large audience may reduce engagement rates. Are you sure you want to continue?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                id="large-segment-cancel-btn"
                onClick={() => setShowLargeWarning(false)}
                className="btn-ghost flex-1 h-11"
              >
                Refine Segment
              </button>
              <button
                id="large-segment-confirm-btn"
                onClick={handleConfirmLarge}
                className="btn-amber flex-1 h-11"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
