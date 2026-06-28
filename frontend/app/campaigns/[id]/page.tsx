"use client";

/**
 * T071: Campaign detail smart router.
 *
 * Fetches campaign state, then routes to the correct sub-page:
 *   REVIEWING   → /campaigns/{id}/review
 *   EXECUTING   → /campaigns/{id}/tracker
 *   COMPLETE    → /campaigns/{id}/results
 *   DRAFT / SEGMENTING / GENERATING → show loading/progress state
 *   STALLED     → /campaigns/{id}/tracker (shows stall alert)
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCampaign, isAuthenticated } from "@/lib/api";
import type { CampaignState } from "@/lib/types";

const STATE_LABELS: Record<string, string> = {
  DRAFT: "Preparing campaign…",
  SEGMENTING: "Identifying your audience…",
  GENERATING: "Crafting personalized messages…",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [state, setState] = useState<CampaignState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  useEffect(() => {
    if (isAuthChecking) return;

    getCampaign(id)
      .then((campaign) => {
        setState(campaign.state);
        // Immediate redirect for terminal/active states
        switch (campaign.state) {
          case "REVIEWING":
            router.replace(`/campaigns/${id}/review`);
            break;
          case "EXECUTING":
            router.replace(`/campaigns/${id}/tracker`);
            break;
          case "COMPLETE":
            router.replace(`/campaigns/${id}/results`);
            break;
          default:
            // DRAFT / SEGMENTING / GENERATING — poll until ready
            break;
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Campaign not found.")
      );
  }, [id, router, isAuthChecking]);

  // Poll for intermediate states
  useEffect(() => {
    if (isAuthChecking) return;
    if (!state || ["REVIEWING", "EXECUTING", "COMPLETE"].includes(state)) return;

    const interval = setInterval(() => {
      getCampaign(id)
        .then((campaign) => {
          setState(campaign.state);
          if (campaign.state === "REVIEWING") {
            clearInterval(interval);
            router.replace(`/campaigns/${id}/review`);
          } else if (campaign.state === "EXECUTING") {
            clearInterval(interval);
            router.replace(`/campaigns/${id}/tracker`);
          } else if (campaign.state === "COMPLETE") {
            clearInterval(interval);
            router.replace(`/campaigns/${id}/results`);
          }
        })
        .catch(() => clearInterval(interval));
    }, 2000);

    return () => clearInterval(interval);
  }, [state, id, router, isAuthChecking]);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-550 font-semibold text-sm">
          <svg className="w-5 h-5 animate-spin text-zinc-950" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking workspace session…
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center p-8 bg-white border border-zinc-200 rounded-2xl shadow-sm max-w-sm">
          <p className="text-rose-600 font-semibold mb-4">{error}</p>
          <button
            onClick={() => router.push("/campaigns")}
            className="rounded-full bg-zinc-950 hover:bg-zinc-800 px-6 py-2.5 text-sm font-bold text-white transition-colors shadow-sm"
          >
            ← Back to History
          </button>
        </div>
      </div>
    );
  }

  // Loading / in-progress state
  const progressLabel = state ? (STATE_LABELS[state] ?? "Loading campaign…") : "Loading campaign…";

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
      <div className="text-center animate-fadeIn">
        {/* Animated spinner */}
        <div className="relative mx-auto mb-6 w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-zinc-200" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-zinc-950 animate-spin" />
          <div className="absolute inset-2 rounded-full bg-zinc-950/5" />
        </div>

        <h2 className="text-base font-bold text-zinc-900 mb-2">{progressLabel}</h2>

        {state && (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950 border border-zinc-950 text-white text-xs font-bold shadow-sm mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            {state}
          </div>
        )}
      </div>
    </div>
  );
}
