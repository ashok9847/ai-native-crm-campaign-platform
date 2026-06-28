"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listCampaigns, isAuthenticated } from "@/lib/api";
import CampaignTable from "@/components/history/CampaignTable";
import type { CampaignListItem } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { Loader, FolderOpen } from "lucide-react";

export default function CampaignsPage() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  const fetchCampaigns = (showLoading = true) => {
    if (showLoading) setLoading(true);
    listCampaigns(1, 50)
      .then((res) => {
        setCampaigns(res.items);
        setTotal(res.total);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load campaigns.")
      )
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  };

  useEffect(() => {
    if (isAuthChecking) return;
    const timer = setTimeout(() => {
      fetchCampaigns(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [isAuthChecking]);

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

  const headerActions = (
    <Link
      href="/campaigns/new"
      className="btn-primary h-11 flex items-center justify-center"
    >
      + New Campaign
    </Link>
  );

  return (
    <PageWrapper
      title="Campaign History"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Campaigns" }
      ]}
      actions={headerActions}
    >
      <div className="space-y-6">

        {/* Error */}
        {error && (
          <div className="rounded-[18px] bg-red-light p-4 text-red text-xs font-bold uppercase tracking-wider animate-fadeIn border-none shadow-none">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-[18px] bg-surface" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && campaigns.length === 0 && (
          <div className="rounded-[18px] bg-surface py-20 text-center border-none shadow-none animate-slideInUp">
            <FolderOpen className="w-12 h-12 text-text-faint mx-auto mb-4" />
            <h2 className="text-lg font-bold text-text mb-2">
              No campaigns yet
            </h2>
            <p className="text-text-muted text-xs mb-6 max-w-xs mx-auto leading-relaxed font-semibold">
              Create your first AI-powered campaign to start engaging your customers.
            </p>
            <Link
              href="/campaigns/new"
              className="btn-primary h-11 inline-flex items-center justify-center"
            >
              + Create First Campaign
            </Link>
          </div>
        )}

        {/* Campaign table */}
        {!loading && campaigns.length > 0 && (
          <div className="animate-slideInUp">
            <CampaignTable campaigns={campaigns} onRefresh={() => fetchCampaigns(false)} />
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
