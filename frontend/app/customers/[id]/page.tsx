"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile, isAuthenticated } from "@/lib/api";
import type { CustomerProfileResponse } from "@/lib/types";
import { HealthGauge } from "@/components/charts/health-gauge";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-50 text-zinc-500 border border-zinc-200/50",
  sent: "bg-zinc-50 text-zinc-700 border border-zinc-200",
  delivered: "bg-emerald-50 text-emerald-700 border border-emerald-200/50",
  opened: "bg-zinc-950 text-white border border-zinc-950",
  read: "bg-zinc-950 text-white border border-zinc-950",
  clicked: "bg-amber-50 text-amber-700 border border-amber-200/60",
  purchased: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border border-rose-200",
};

const TIER_COLORS: Record<string, string> = {
  starter: "bg-zinc-100 text-zinc-600 border border-zinc-200/60",
  premium: "bg-amber-50 text-amber-700 border border-amber-200/55",
  elite: "bg-zinc-950 text-white border border-zinc-950",
};

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const customerId = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CustomerProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    if (!customerId) return;

    async function load() {
      try {
        const result = await getCustomerProfile(customerId);
        setData(result);
      } catch (err: any) {
        setError(err.message || "Failed to load customer profile.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, customerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] text-zinc-950 pb-16">
        <div className="relative max-w-5xl mx-auto px-6 pt-10 animate-pulse">
          <div className="h-9 w-48 bg-zinc-200 rounded-xl mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-1 h-72 rounded-2xl border border-zinc-200 bg-white" />
            <div className="col-span-2 h-72 rounded-2xl border border-zinc-200 bg-white" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="text-center p-8 bg-white border border-zinc-200 rounded-2xl shadow-sm max-w-sm">
          <p className="text-rose-600 font-semibold mb-4">{error || "Customer not found"}</p>
          <Link href="/dashboard" className="rounded-xl bg-zinc-950 hover:bg-zinc-800 px-6 py-2.5 text-sm text-white font-bold transition-colors shadow-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const c = data.customer;
  const h = data.health;

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-zinc-900 pb-16 relative">
      <div className="relative max-w-6xl mx-auto px-6 pt-10">
        {/* Header */}
        <header className="mb-8 pb-6 border-b border-zinc-200/80">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-900 font-bold transition-colors">
              ← Dashboard
            </Link>
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-200" />
            <span className="text-xs text-zinc-400 font-semibold">Customer #{c.id}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-950 text-2xl font-bold text-white shadow-sm">
              {c.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-zinc-950 tracking-tight leading-none mb-1">{c.name}</h1>
              <p className="text-xs text-zinc-500 font-semibold">{c.email}</p>
            </div>
            <span className={`ml-auto rounded-full ${TIER_COLORS[c.subscription_tier] || "bg-zinc-100 text-zinc-600"} px-4 py-1.5 text-xs font-bold uppercase tracking-wider`}>
              {c.subscription_tier}
            </span>
          </div>
        </header>

        {/* Profile Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left: Health Score & Details */}
          <div className="space-y-6">
            {/* Health Score Card */}
            {h && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Health Score
                </h3>
                <div className="flex justify-center mb-4">
                  <HealthGauge score={h.score} size={140} strokeWidth={12} />
                </div>
                {/* Sub-scores */}
                <div className="space-y-2">
                  {h.breakdown && Object.entries(h.breakdown).map(([key, signal]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 font-semibold capitalize">{key}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-zinc-950 transition-all duration-700"
                            style={{ width: `${signal.score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-450 font-bold w-8 text-right">
                          {signal.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {h.recommended_action && (
                  <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/50 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-amber-700 mb-1">
                      Recommended Action
                    </p>
                    <p className="text-xs text-amber-950 leading-relaxed font-semibold">{h.recommended_action}</p>
                  </div>
                )}
              </div>
            )}

            {/* Customer Details */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                Details
              </h3>
              <div className="space-y-3">
                {[
                  { label: "City", value: c.city || "—" },
                  { label: "Roast Pref", value: c.roast_preference || "—" },
                  { label: "Last Order", value: c.last_order_date || "Never" },
                  { label: "Lifetime Value", value: c.lifetime_value ? `₹${c.lifetime_value.toLocaleString()}` : "₹0" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 font-semibold">{item.label}</span>
                    <span className="text-xs text-zinc-900 font-bold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Orders & Communications */}
          <div className="lg:col-span-2 space-y-6">
            {/* Orders */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                Order History ({data.orders.length})
              </h3>
              {data.orders.length > 0 ? (
                <div className="space-y-2">
                  {data.orders.slice(0, 10).map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-150 bg-zinc-50/30 p-3 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📦</span>
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">Order #{order.id}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-0.5">
                            {order.order_date}
                            {order.communication_id && (
                              <span className="ml-2 text-zinc-950 font-extrabold uppercase">
                                • Attributed
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                        ₹{order.total_amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-450 text-center font-semibold py-4 animate-pulse">No orders yet</p>
              )}
            </div>

            {/* Communications */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                Communications ({data.communications.length})
              </h3>
              {data.communications.length > 0 ? (
                <div className="space-y-2">
                  {data.communications.slice(0, 10).map((comm) => (
                    <Link
                      key={comm.id}
                      href={`/campaigns/${comm.campaign_id}`}
                      className="flex items-center justify-between rounded-xl border border-zinc-150 bg-zinc-50/30 p-3 transition-all hover:bg-zinc-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-zinc-900 truncate">
                            {comm.campaign_name}
                          </p>
                          <span className="text-[10px] font-bold uppercase text-zinc-400">{comm.channel}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {comm.body.slice(0, 85)}
                          {comm.body.length > 85 ? "…" : ""}
                        </p>
                      </div>
                      <span
                        className={`ml-3 flex-shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                          STATUS_COLORS[comm.status] || "bg-zinc-50 text-zinc-500"
                        }`}
                      >
                        {comm.status}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-450 text-center font-semibold py-4 animate-pulse">No communications yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
