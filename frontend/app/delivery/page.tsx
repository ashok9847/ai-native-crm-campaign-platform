"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDeadLetterCallbacks, getProfile, isAuthenticated } from "@/lib/api";
import type { DeadLetterCallbackItem, UserProfileResponse } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { AlertCircle, RefreshCw, Terminal, Eye, EyeOff } from "lucide-react";

export default function DeliveryHealthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DeadLetterCallbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function load() {
    try {
      setLoading(true);
      const [profData, deadLetterData] = await Promise.all([
        getProfile(),
        getDeadLetterCallbacks(),
      ]);
      setProfile(profData);
      setItems(deadLetterData.items || []);
      setTotal(deadLetterData.total || 0);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load delivery health.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <PageWrapper title="Delivery Health & Dead Letter">
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-[18px] bg-surface" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="text-center p-8 bg-surface rounded-[18px] max-w-sm w-full">
          <p className="text-red font-bold mb-4">{error}</p>
          <button onClick={load} className="btn-primary w-full h-11">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const headerActions = (
    <button
      onClick={load}
      className="btn-ghost flex items-center gap-1.5 px-4 h-10 text-xs font-bold"
    >
      <RefreshCw className="w-3.5 h-3.5" /> Refresh Log
    </button>
  );

  return (
    <PageWrapper
      title="Delivery Health"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Communications", href: "/communications" },
        { label: "Delivery Health" }
      ]}
      actions={headerActions}
    >
      <div className="space-y-6">
        {/* Intro */}
        <div className="rounded-[18px] bg-amber-light p-6 border-none text-amber flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold tracking-tight text-amber-dark">
              Dead Letter Callback Queue
            </h3>
            <p className="text-xs text-amber-muted mt-1 leading-relaxed">
              Webhook delivery callbacks that failed all 3 exponential backoff retry attempts (5s, 15s, 45s) are recorded here. 
              Review the payload and diagnostic errors below to troubleshoot delivery issues with integration stubs.
            </p>
          </div>
        </div>

        {/* Failed items list */}
        <div className="rounded-[18px] bg-surface overflow-hidden">
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="global-table">
                <thead className="global-table-thead">
                  <tr>
                    <th className="global-table-th">Callback URL</th>
                    <th className="global-table-th">Error Reason</th>
                    <th className="global-table-th">Failed At</th>
                    <th className="global-table-th text-center">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isExpanded = expandedId === item.id;
                    return (
                      <>
                        <tr key={item.id} className="global-table-tr border-b-none">
                          <td className="global-table-td font-mono text-xs max-w-[250px] truncate" title={item.callback_url}>
                            {item.callback_url}
                          </td>
                          <td className="global-table-td max-w-[300px]">
                            <p className="text-xs text-red font-bold leading-tight">
                              {item.reason}
                            </p>
                          </td>
                          <td className="global-table-td text-xs text-text-muted font-semibold tabular-nums">
                            {new Date(item.failed_at).toLocaleString("en-IN")}
                          </td>
                          <td className="global-table-td text-center">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="btn-ghost h-8 px-2 rounded-lg flex items-center gap-1 mx-auto text-xs font-bold"
                            >
                              {isExpanded ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" /> Hide
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" /> View
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${item.id}-details`} className="bg-white">
                            <td colSpan={4} className="px-6 py-4 border-t border-border">
                              <div className="rounded-xl bg-[#FAFAFA] p-4 font-mono text-[11px] text-text-muted border border-border overflow-x-auto">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-faint uppercase mb-2">
                                  <Terminal className="w-3.5 h-3.5" /> Event Payload Data
                                </div>
                                <pre>{JSON.stringify(item.event_payload, null, 2)}</pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-text-muted uppercase tracking-wider text-xs font-bold">
              No dead-lettered callbacks found. Delivery channels are running healthy!
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
