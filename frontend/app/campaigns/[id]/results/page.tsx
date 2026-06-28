"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCampaignResults, isAuthenticated } from "@/lib/api";
import ResultsPanel from "@/components/campaign/ResultsPanel";
import InsightCard from "@/components/campaign/InsightCard";
import type { CampaignResultsResponse } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { Loader, ChevronLeft } from "lucide-react";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [results, setResults] = useState<CampaignResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

    getCampaignResults(id)
      .then(setResults)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load results.")
      )
      .finally(() => setLoading(false));
  }, [id, isAuthChecking]);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted font-bold text-xs uppercase tracking-wider">
          <Loader className="w-5 h-5 animate-spin text-accent" />
          Checking workspace session…
        </div>
      </div>
    );
  }

  return (
    <PageWrapper
      title={loading ? "Loading results…" : "Campaign Results"}
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Campaigns", href: "/campaigns" },
        { label: results ? `Campaign #${results.campaign_id}` : `Campaign Results` }
      ]}
    >
      <div className="max-w-3xl mx-auto space-y-6">

        {/* State Banner */}
        {results && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-pill bg-green-light text-green text-xs font-bold uppercase tracking-wider w-fit animate-fadeIn">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            Campaign Complete
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-[18px] bg-red-light p-5 text-red space-y-3 animate-fadeIn border-none shadow-none">
            <p className="text-xs font-bold uppercase tracking-wider">{error}</p>
            <div>
              <button
                onClick={() => router.push(`/campaigns/${id}/tracker`)}
                className="text-xs font-bold uppercase tracking-widest hover:underline flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Back to tracker
              </button>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div className="space-y-4 animate-pulse">
            <div className="h-24 rounded-[18px] bg-surface" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 rounded-[18px] bg-surface" />
              ))}
            </div>
          </div>
        )}

        {/* Results content */}
        {results && (
          <div className="space-y-6">
            
            {/* AI Summary + Metrics */}
            <ResultsPanel
              aiSummary={results.ai_summary}
              metrics={results.metrics}
              clickedCustomers={results.clicked_customers}
              purchasedCustomers={results.purchased_customers}
            />

            {/* Insight Card */}
            {results.insight_card && (
              <InsightCard insight={results.insight_card} />
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => router.push("/dashboard")}
                className="btn-ghost px-5 h-11 inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Home
              </button>
              <button
                onClick={() => router.push("/campaigns")}
                className="btn-ghost px-5 h-11"
              >
                All Campaigns
              </button>
              <button
                onClick={() => router.push("/campaigns/new")}
                className="btn-primary flex-1 h-11"
              >
                + New Campaign
              </button>
            </div>

          </div>
        )}
      </div>
    </PageWrapper>
  );
}
