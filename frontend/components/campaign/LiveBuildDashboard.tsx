"use client";

import { useEffect, useState } from "react";
import type { FilterCriterion } from "@/lib/types";
import { Brain, AlertTriangle, Sparkles, Check, ArrowRight } from "lucide-react";

interface StreamMessage {
  customer_id: number;
  customer_name: string;
  subscription_tier: string;
  body: string;
  complete: boolean;
}

interface LiveBuildDashboardProps {
  currentStep: "idle" | "draft" | "segmenting" | "generating" | "complete" | "error" | "clarifying";
  statusText: string;
  filters: FilterCriterion[];
  customerCount: number | null;
  sampleCustomers: { id: number; name: string; email: string; subscription_tier?: string }[];
  messages: StreamMessage[];
  campaignId: number | null;
  onProceed: () => void;
  onRetry: () => void;
  errorMsg: string | null;
}

const TIER_BADGES: Record<string, string> = {
  starter: "badge-pending",
  premium: "badge-amber",
  elite: "bg-text text-white px-3.5 py-1.5 rounded-pill text-xs font-extrabold border-none uppercase tracking-wider",
};

export default function LiveBuildDashboard({
  currentStep,
  statusText,
  filters,
  customerCount,
  sampleCustomers,
  messages,
  campaignId,
  onProceed,
  onRetry,
  errorMsg,
}: LiveBuildDashboardProps) {
  const [animatedCount, setAnimatedCount] = useState(0);

  useEffect(() => {
    if (customerCount === null) {
      setAnimatedCount(0);
      return;
    }
    let start = 0;
    const end = customerCount;
    if (end === 0) return;

    const duration = 800; // ms
    const increment = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setAnimatedCount(end);
        clearInterval(timer);
      } else {
        setAnimatedCount(Math.min(start, end));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [customerCount]);

  const getStepStatus = (stepName: "segmenting" | "generating" | "complete") => {
    if (currentStep === "error") return "error";

    if (stepName === "segmenting") {
      if (currentStep === "draft") return "pending";
      if (currentStep === "segmenting" || currentStep === "clarifying") return "active";
      return "complete";
    }
    if (stepName === "generating") {
      if (currentStep === "draft" || currentStep === "segmenting" || currentStep === "clarifying") return "pending";
      if (currentStep === "generating") return "active";
      return "complete";
    }
    if (stepName === "complete") {
      return currentStep === "complete" ? "complete" : "pending";
    }
    return "pending";
  };

  return (
    <div className="mt-8 space-y-6 animate-fadeIn">
      {/* 1. Header & Live Indicator */}
      <div className="flex items-center justify-between p-5 rounded-[18px] bg-surface border-none shadow-none">
        <div className="flex items-center gap-4">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold shrink-0 select-none">
            {currentStep !== "complete" && currentStep !== "error" ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-accent-light opacity-75" />
                <Brain className="relative text-accent animate-pulse w-5 h-5" />
              </>
            ) : currentStep === "error" ? (
              <AlertTriangle className="text-red w-5 h-5" />
            ) : (
              <Sparkles className="text-amber w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-text tracking-tight">
              {currentStep === "error" ? "Generation Paused" : "Copilot Engine Running"}
            </h3>
            <p className="text-xs text-text-muted mt-0.5 font-semibold">
              {statusText || "Initializing campaign setup..."}
            </p>
          </div>
        </div>

        {/* Pipeline Progress Indicator */}
        <div className="hidden md:flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-wider">
          <span
            className={`px-3 py-1.5 rounded-pill transition-all duration-300 ${
              getStepStatus("segmenting") === "complete"
                ? "bg-green-light text-[#166534]"
                : getStepStatus("segmenting") === "active"
                ? "bg-accent text-white animate-pulse"
                : "bg-surface-hover text-text-muted"
            }`}
          >
            1. Auditing
          </span>
          <span className="text-text-faint">→</span>
          <span
            className={`px-3 py-1.5 rounded-pill transition-all duration-300 ${
              getStepStatus("generating") === "complete"
                ? "bg-green-light text-[#166534]"
                : getStepStatus("generating") === "active"
                ? "bg-accent text-white animate-pulse"
                : "bg-surface-hover text-text-muted"
            }`}
          >
            2. Personalizing
          </span>
          <span className="text-text-faint">→</span>
          <span
            className={`px-3 py-1.5 rounded-pill transition-all duration-300 ${
              getStepStatus("complete") === "complete"
                ? "bg-green-light text-[#166534]"
                : "bg-surface-hover text-text-muted"
            }`}
          >
            3. Finalized
          </span>
        </div>
      </div>

      {/* Error state alert panel */}
      {currentStep === "error" && (
        <div className="p-5 rounded-[18px] bg-red-light text-red space-y-4 border-none shadow-none">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold tracking-tight">Generation Failed</h4>
              <p className="text-xs text-red mt-1 leading-relaxed font-semibold">
                {errorMsg || "An unexpected error occurred. Please try restarting the generation pipeline."}
              </p>
            </div>
          </div>
          <button
            onClick={onRetry}
            className="btn-danger flex items-center justify-center gap-1.5 cursor-pointer border-none"
          >
            Restart Pipeline
          </button>
        </div>
      )}

      {/* 2. Audiences Filter Tag Board */}
      <div className="rounded-[18px] bg-surface p-6 space-y-4 border-none shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h4 className="text-sm font-bold text-text tracking-tight">Segment Filters Extraction</h4>
            <p className="text-xs text-text-muted mt-0.5 font-semibold">Filters defined by Kimi AI from intent</p>
          </div>
          {customerCount !== null && (
            <div className="badge-success h-8 flex items-center justify-center">
              <span className="text-xs font-extrabold tabular-nums mr-1">{animatedCount}</span>
              <span className="text-xs uppercase tracking-wider leading-none">Matched</span>
            </div>
          )}
        </div>

        {/* Filter list */}
        <div className="flex flex-wrap gap-2.5">
          {filters.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-1 animate-pulse font-semibold">
              <span className="w-2 h-2 rounded-full bg-text-faint animate-pulse" />
              Waiting for segment parameters...
            </div>
          ) : (
            filters.map((f, i) => (
              <span
                key={i}
                className="px-3.5 py-1.5 rounded-pill bg-white text-xs text-text font-mono tracking-tight font-bold border-none shadow-none animate-fadeIn hover:bg-surface-hover transition-colors duration-200 cursor-default"
              >
                <span className="text-text-muted">{f.field}</span> {f.operator}{" "}
                <span className="text-accent">
                  {Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}
                </span>
              </span>
            ))
          )}
        </div>

        {/* Sample Customer Avatars */}
        {sampleCustomers.length > 0 && (
          <div className="pt-2">
            <p className="text-xs text-text-muted font-bold uppercase tracking-wider mb-2.5">Segment Sample Audited:</p>
            <div className="flex flex-wrap gap-2.5">
              {sampleCustomers.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-white text-xs border-none shadow-none font-bold animate-fadeIn hover:bg-surface-hover transition-colors duration-200 cursor-default"
                >
                  <div className="w-5 h-5 rounded-full bg-accent text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <span className="text-text">{c.name}</span>
                  {c.subscription_tier && (
                    <span className={TIER_BADGES[c.subscription_tier] || "badge-pending"}>
                      {c.subscription_tier}
                    </span>
                  )}
                </div>
              ))}
              {customerCount !== null && customerCount > 8 && (
                <div className="text-xs text-text-muted self-center pl-1 font-bold">
                  + {customerCount - 8} more...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Live Message Writing Dashboard */}
      {messages.length > 0 && (
        <div className="bg-white border border-border rounded-[18px] p-6 space-y-4 shadow-sm animate-fadeIn">
          <div className="border-b border-border pb-3">
            <h4 className="text-sm font-bold text-text tracking-tight">Personalized Message Drafts</h4>
            <p className="text-xs text-text-muted mt-0.5 font-semibold">Generating copy for each recipient in real-time</p>
          </div>

          <div className="max-h-[380px] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {messages.map((m) => {
                const active = !m.complete && m.body.length > 0;
                return (
                  <div
                    key={m.customer_id}
                    className={`flex flex-col p-5 rounded-[18px] transition-all duration-300 relative border-none animate-slideInUp ${
                      active
                        ? "bg-white ring-2 ring-accent scale-[1.01]"
                        : m.complete
                        ? "bg-surface hover:bg-surface-hover hover:scale-[1.01]"
                        : "bg-surface/50 opacity-40"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center text-xs font-bold text-accent">
                          {m.customer_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-text">{m.customer_name}</p>
                          <p className="text-xs text-text-muted font-bold tracking-tight mt-0.5">ID: #{m.customer_id}</p>
                        </div>
                      </div>
                      <span className={TIER_BADGES[m.subscription_tier] || "badge-pending"}>
                        {m.subscription_tier}
                      </span>
                    </div>

                    {/* Message Body */}
                    <div className={`flex-1 rounded-[12px] p-3.5 min-h-[80px] transition-colors ${active || m.complete ? "bg-white border border-border" : "bg-surface/30"}`}>
                      <p className="text-xs text-text leading-relaxed font-medium select-none break-words whitespace-pre-wrap">
                        {m.body || "Awaiting drafting context..."}
                        {active && (
                          <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 animate-pulse rounded-full align-middle" />
                        )}
                      </p>
                    </div>

                    {/* Status Indicator */}
                    <div className="mt-3 flex items-center justify-between text-xs font-bold text-text-muted uppercase tracking-wider">
                      <span>Channel: SMS</span>
                      <span
                        className={`flex items-center gap-1.5 ${
                          m.complete
                            ? "text-[#166534] font-extrabold"
                            : active
                            ? "text-accent animate-pulse font-extrabold"
                            : "text-text-muted"
                        }`}
                      >
                        {m.complete ? (
                          <>
                            <Check className="w-4 h-4 text-[#166534]" />
                            Draft Ready
                          </>
                        ) : active ? (
                          "Writing message..."
                        ) : (
                          "Queued"
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Complete Action CTA Gate */}
      {currentStep === "complete" && campaignId !== null && (
        <div className="flex justify-end pt-2 animate-scaleUp">
          <button
            id="proceed-review-btn"
            onClick={onProceed}
            className="btn-primary flex items-center gap-2 cursor-pointer border-none"
          >
            Proceed to Review & Edit
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
