"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getDashboard,
  getDashboardStats,
  getProfile,
  getChurnAlerts,
  listCrmFields,
  isAuthenticated,
} from "@/lib/api";
import type {
  DashboardResponse,
  UserProfileResponse,
  ChurnAlertItem,
  CRMFieldResponse,
} from "@/lib/types";
import { CampaignReachChart } from "@/components/charts/campaign-reach-chart";
import { ChannelDonut } from "@/components/charts/channel-donut";
import { ChurnAlertStrip } from "@/components/churn-alert-strip";
import PageWrapper from "@/components/layout/PageWrapper";
import StatCard from "@/components/ui/StatCard";
import { Users, Megaphone, DollarSign, MailOpen, Sparkles, ArrowRight } from "lucide-react";

const STATE_BADGES: Record<string, string> = {
  DRAFT: "badge-pending",
  SEGMENTING: "badge-running",
  GENERATING: "badge-running",
  REVIEWING: "badge-amber",
  EXECUTING: "badge-running animate-pulse",
  COMPLETE: "badge-success",
  CANCELLED: "badge-failed",
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [churnAlerts, setChurnAlerts] = useState<ChurnAlertItem[]>([]);
  const [totalAtRisk, setTotalAtRisk] = useState(0);
  const [totalChurning, setTotalChurning] = useState(0);
  const [crmFields, setCrmFields] = useState<CRMFieldResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copilotIntent, setCopilotIntent] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    async function loadDashboardData() {
      try {
        const [profData, dashData, crmData] = await Promise.all([
          getProfile(),
          getDashboard().catch(() => null),
          listCrmFields(),
        ]);

        setProfile(profData);
        setCrmFields(crmData);

        if (dashData) {
          setDashboard(dashData);
        }

        const stats = await getDashboardStats();
        if (stats.total_customers === 0) {
          router.replace("/setup");
          return;
        }

        try {
          const alertData = await getChurnAlerts(6);
          setChurnAlerts(alertData.alerts || []);
          setTotalAtRisk(alertData.total_at_risk || 0);
          setTotalChurning(alertData.total_churning || 0);
        } catch {
          // Churn alerts are optional
        }
      } catch (err: any) {
        console.error("Dashboard load failed:", err);
        setError(err.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [router]);

  const handleLaunchCopilot = () => {
    const trimmed = copilotIntent.trim();
    if (!trimmed) return;
    router.push(`/campaigns/new?intent=${encodeURIComponent(trimmed)}`);
  };

  const getAISuggestions = () => {
    const base = [
      "Re-engage premium tier customers who haven't ordered in 30 days with a personalized discount",
      "Offer a weekend coupon code to all customers living in Mumbai",
    ];
    crmFields.forEach((field) => {
      if (field.field_name === "preferred_roast")
        base.push(
          "Invite Dark roast profile fans to try our new robusta espresso blend"
        );
      if (field.field_name === "preferred_style")
        base.push(
          "Target casual style shoppers with our new summer collection catalog"
        );
      if (field.field_name === "size_preference")
        base.push(
          "Promote an exclusive flash sale to customers with M size preference"
        );
    });
    return base.slice(0, 3);
  };

  if (loading) {
    return (
      <PageWrapper title="Command Center">
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-[18px] bg-surface"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
            <div className="h-80 rounded-[18px] bg-surface" />
            <div className="h-80 rounded-[18px] bg-surface" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="text-center p-8 bg-surface rounded-[18px] max-w-sm w-full">
          <p className="text-red font-bold mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary w-full"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const m = dashboard?.metrics;

  const headerActions = (
    <div className="flex items-center gap-3">
      <Link href="/analytics" className="btn-ghost">
        Analytics →
      </Link>
      <Link href="/campaigns" className="btn-primary">
        All Campaigns
      </Link>
    </div>
  );

  return (
    <PageWrapper title="Command Center" actions={headerActions}>
      <div className="space-y-8">
        
        {/* ── AI Copilot Command Center ───────────────────────────────── */}
        <div className="rounded-[18px] bg-[#F7F9FF] p-6 border-none shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-light text-amber shrink-0 select-none">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-accent tracking-tight">
              AI Campaign Copilot
            </h2>
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <textarea
              id="copilot-intent"
              value={copilotIntent}
              onChange={(e) => setCopilotIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleLaunchCopilot();
                }
              }}
              placeholder="Describe your campaign intent in plain English..."
              rows={2}
              className="flex-1 resize-none rounded-[18px] bg-white px-5 py-3.5 text-sm text-text placeholder-text-faint outline-none transition-all focus:ring-2 focus:ring-accent-light border-none shadow-none"
            />
            <button
              id="launch-copilot-btn"
              onClick={handleLaunchCopilot}
              disabled={!copilotIntent.trim()}
              className="btn-primary self-end h-11 shrink-0 px-6 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
            >
              Launch →
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Try:
            </span>
            {getAISuggestions().map((s, i) => (
              <button
                key={i}
                onClick={() => setCopilotIntent(s)}
                className="rounded-pill bg-white px-4 h-10 text-xs font-bold text-text-muted transition-all hover:bg-surface-hover hover:text-text cursor-pointer border-none shadow-none flex items-center justify-center"
              >
                {s.length > 55 ? s.slice(0, 55) + "…" : s}
              </button>
            ))}
          </div>
        </div>

        {/* ── Churn Alert Strip ────────────────────────────────────────── */}
        {(totalAtRisk > 0 || totalChurning > 0) && (
          <div className="animate-fadeIn">
            <ChurnAlertStrip
              alerts={churnAlerts}
              totalAtRisk={totalAtRisk}
              totalChurning={totalChurning}
            />
          </div>
        )}

        {/* ── KPI Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          <StatCard
            label="Total Customers"
            value={m?.total_customers ?? 0}
            delta={{ value: "12.4% vs last month", isPositive: true }}
            icon={<Users className="w-5 h-5" />}
            iconBg="bg-accent-light text-accent"
            interactive={true}
            onClick={() => router.push("/customers")}
          />
          <StatCard
            label="Total Campaigns"
            value={m?.total_campaigns ?? 0}
            delta={{ value: "8.2% vs last month", isPositive: true }}
            icon={<Megaphone className="w-5 h-5" />}
            iconBg="bg-green-light text-green"
            interactive={true}
            onClick={() => router.push("/campaigns")}
          />
          <StatCard
            label="Attributed Revenue"
            value={`₹${Math.round(m?.attributed_revenue ?? 0).toLocaleString()}`}
            delta={{ value: "15.7% vs last month", isPositive: true }}
            icon={<DollarSign className="w-5 h-5" />}
            iconBg="bg-amber-light text-amber"
            interactive={true}
            onClick={() => router.push("/analytics")}
          />
          <StatCard
            label="Organic Revenue"
            value={`₹${Math.round(m?.organic_revenue ?? 0).toLocaleString()}`}
            delta={{ value: "11.2% vs last month", isPositive: true }}
            icon={<DollarSign className="w-5 h-5" />}
            iconBg="bg-green-light text-green"
            interactive={true}
            onClick={() => router.push("/analytics")}
          />
          <StatCard
            label="Open Rate"
            value={`${Math.round(m?.avg_open_rate ?? 0)}%`}
            delta={{ value: "2.1% vs last month", isNegative: true }}
            icon={<MailOpen className="w-5 h-5" />}
            iconBg="bg-red-light text-red"
            interactive={true}
            onClick={() => router.push("/communications")}
          />
        </div>

        {/* ── Charts Row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CampaignReachChart data={dashboard?.campaign_reach ?? []} />
          <ChannelDonut data={dashboard?.channels_used ?? []} />
        </div>

        {/* ── Recent Campaigns ────────────────────────────────────────── */}
        <div className="rounded-[18px] bg-surface p-6 border-none shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Recent Campaigns
            </h3>
            <Link
              href="/campaigns"
              className="text-xs font-bold uppercase tracking-wider text-accent hover:underline transition-colors"
            >
              View All →
            </Link>
          </div>
          <div className="space-y-3">
            {dashboard?.recent_campaigns && dashboard.recent_campaigns.length > 0 ? (
              dashboard.recent_campaigns.map((camp) => (
                <Link key={camp.id} href={`/campaigns/${camp.id}`} className="block">
                  <div className="flex items-center justify-between rounded-[18px] bg-white p-4 hover:bg-surface-hover hover:scale-[1.01] transition-all duration-200 cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
                        {camp.channel?.toUpperCase().slice(0, 2) || "SM"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-text">
                          {camp.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={STATE_BADGES[camp.state] || "badge-pending"}>
                            {camp.state}
                          </span>
                          <span className="text-xs text-text-muted font-medium">
                            {camp.created_at
                              ? new Date(camp.created_at).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                })
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Reach</p>
                        <p className="text-sm font-bold text-text">
                          {camp.reach}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Revenue</p>
                        <p className="text-sm font-bold text-green">
                          ₹{camp.revenue.toLocaleString()}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-text-muted shrink-0" />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex h-20 items-center justify-center text-sm text-text-muted font-medium">
                No campaigns yet — launch one with the AI Copilot above!
              </div>
            )}
          </div>
        </div>

        {/* ── Customer Tier Breakdown ──────────────────────────────────── */}
        {dashboard?.customer_tiers && dashboard.customer_tiers.length > 0 && (
          <div className="rounded-[18px] bg-surface p-6 border-none shadow-none">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
              Customer Tiers
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {dashboard.customer_tiers.map((tier) => (
                <div
                  key={tier.name}
                  className="rounded-[18px] bg-white p-4 text-center hover:bg-surface-hover hover:scale-[1.01] transition-all duration-200"
                >
                  <p className="text-2xl font-extrabold text-text tracking-tight">
                    {tier.value}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-text-muted">
                    {tier.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
