"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAnalytics, isAuthenticated, getProfile } from "@/lib/api";
import type { AnalyticsResponse, UserProfileResponse } from "@/lib/types";
import { KpiCard } from "@/components/charts/kpi-card";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    async function load() {
      try {
        const [profData, analyticsData] = await Promise.all([
          getProfile(),
          getAnalytics(days),
        ]);
        setProfile(profData);
        setData(analyticsData);
      } catch (err: any) {
        setError(err.message || "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, days]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 pb-16">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-10">
          <div className="h-9 w-48 bg-zinc-200 rounded-full mb-8 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-lg border border-zinc-200 bg-white" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
            <div className="h-80 rounded-lg border border-zinc-200 bg-white" />
            <div className="h-80 rounded-lg border border-zinc-200 bg-white" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center p-8 bg-white border border-zinc-200 rounded-xl shadow-sm max-w-sm">
          <p className="text-rose-600 font-semibold mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-zinc-950 px-6 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 transition-all shadow-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 relative pb-16">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-10">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-zinc-200/80">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <Link href="/dashboard" className="text-xs font-bold text-zinc-950 hover:text-zinc-800 transition-colors">
                ← Dashboard
              </Link>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-200" />
              <span className="text-xs text-zinc-500 font-medium">{profile?.tenant_name}</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900">
              Analytics
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-all shadow-sm ${
                  days === d
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
          <KpiCard
            label="Total Revenue"
            value={Math.round(kpis?.total_revenue ?? 0)}
            prefix="₹"
            trend={14.3}
            icon={<span className="text-lg">💰</span>}
          />
          <KpiCard
            label="Attributed Revenue"
            value={Math.round(kpis?.attributed_revenue ?? 0)}
            prefix="₹"
            trend={8.9}
            icon={<span className="text-lg">📊</span>}
          />
          <KpiCard
            label="Organic Revenue"
            value={Math.round(kpis?.organic_revenue ?? 0)}
            prefix="₹"
            trend={11.2}
            icon={<span className="text-lg">🌱</span>}
          />
          <KpiCard
            label="Total Orders"
            value={kpis?.total_orders ?? 0}
            trend={6.5}
            icon={<span className="text-lg">📦</span>}
          />
          <KpiCard
            label="Global Conversion Rate"
            value={Math.round(kpis?.global_conversion_rate ?? 0)}
            suffix="%"
            trend={-1.2}
            icon={<span className="text-lg">🎯</span>}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <RevenueAreaChart data={data?.revenue_over_time ?? []} />
          <FunnelChart data={data?.funnel ?? []} />
        </div>

        {/* Channel Performance Table */}
        {data?.channel_performance && data.channel_performance.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm mb-8">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
              Channel Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 h-12">
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Channel</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Sent</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Delivered</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Opened</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Clicked</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Converted</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Revenue</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-bold text-right">Conv %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.channel_performance.map((ch) => (
                    <tr key={ch.name} className="hover:bg-zinc-50/50 transition-colors h-14">
                      <td className="px-4 py-3 font-bold text-zinc-900 uppercase text-xs">{ch.name}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 font-semibold tabular-nums">{ch.sent.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 font-semibold tabular-nums">{ch.delivered.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 font-semibold tabular-nums">{ch.opened.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 font-semibold tabular-nums">{ch.clicked.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-bold tabular-nums">{ch.converted.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-bold tabular-nums">₹{ch.revenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-zinc-950 font-bold tabular-nums">{ch.conversion_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Campaigns */}
        {data?.top_campaigns && data.top_campaigns.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
              Top Campaigns by Revenue
            </h3>
            <div className="space-y-3">
              {data.top_campaigns.map((camp, i) => (
                <Link
                  key={camp.id}
                  href={`/campaigns/${camp.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/50 p-4 transition-all hover:border-zinc-200 hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950/10 text-xs font-bold text-zinc-950">
                      #{i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">{camp.name}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{camp.channel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Target</p>
                      <p className="text-sm font-semibold text-zinc-600 tabular-nums">{camp.target.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Converted</p>
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">{camp.converted.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Revenue</p>
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">₹{camp.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
