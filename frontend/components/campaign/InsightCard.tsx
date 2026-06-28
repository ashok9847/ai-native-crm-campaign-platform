"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InsightCard as InsightCardType } from "@/lib/types";

interface InsightCardProps {
  insight: InsightCardType;
}

export default function InsightCard({ insight }: InsightCardProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleYes() {
    const params = new URLSearchParams({ intent: insight.suggested_followup_intent });
    if (insight.clicked_customer_ids?.length) {
      params.set("customer_ids", insight.clicked_customer_ids.join(","));
    }
    router.push(`/campaigns/new?${params.toString()}`);
  }

  return (
    <div className="relative rounded-[18px] bg-amber-light p-6 border-none shadow-none animate-fadeIn flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="w-11 h-11 bg-amber text-white rounded-xl flex items-center justify-center text-lg font-bold shrink-0 select-none">
            ✦
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[#A07830] tracking-tight">
              AI Moment: Click-through Insight
            </span>
            <p className="text-xs text-[#B58A3D] font-medium leading-relaxed">
              There {insight.clicked_no_purchase_count === 1 ? "is" : "are"}{" "}
              <span className="font-extrabold text-[#A07830]">{insight.clicked_no_purchase_count}</span>{" "}
              {insight.clicked_no_purchase_count === 1 ? "customer" : "customers"} who clicked but didn&apos;t purchase yet.
              Should I create a personalized follow-up campaign for them?
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setDismissed(true)}
          className="text-[#B58A3D] hover:text-[#A07830] transition-colors text-lg leading-none cursor-pointer font-bold"
          aria-label="Dismiss insight"
        >
          ×
        </button>
      </div>

      {/* Suggested intent preview box */}
      <div className="rounded-[18px] bg-white p-4 text-[12px] text-text-muted italic border-none shadow-none">
        &ldquo;{insight.suggested_followup_intent}&rdquo;
      </div>

      {/* CTA buttons */}
      <div className="flex gap-3 pt-1">
        <button
          id="insight-yes-btn"
          onClick={handleYes}
          className="btn-amber flex-1 h-11"
        >
          Yes, create follow-up →
        </button>
        <button
          id="insight-dismiss-btn"
          onClick={() => setDismissed(true)}
          className="btn-ghost text-[#A07830] hover:text-[#A07830]/80 h-11 px-6 bg-white/40"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
