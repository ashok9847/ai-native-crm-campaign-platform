"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEventSource } from "@/lib/hooks/useEventSource";
import { getCampaignStreamUrl, cancelCampaign, isAuthenticated } from "@/lib/api";
import type { DeliveryStatus } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { Loader, AlertTriangle, AlertCircle, RefreshCw, ChevronLeft, ArrowRight } from "lucide-react";

const STATUS_BADGES: Record<DeliveryStatus | string, string> = {
  sent: "badge-pending",
  delivered: "badge-success",
  opened: "badge-running",
  read: "badge-running",
  clicked: "badge-blue",
  purchased: "badge-success",
  failed: "badge-failed",
};

const STATUS_LABELS: Record<DeliveryStatus | string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  read: "Read",
  clicked: "Clicked",
  purchased: "Purchased",
  failed: "Failed",
};

function StatusBadge({ status }: { status: string }) {
  const badgeClass = STATUS_BADGES[status] ?? "badge-pending";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={badgeClass}>
      {label}
    </span>
  );
}

export default function TrackerPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  const streamUrl = getCampaignStreamUrl(id);
  const { statuses, isComplete, isCancelled, isStalled, error } = useEventSource(
    isAuthChecking ? "" : streamUrl
  );

  // Auto-redirect on completion
  useEffect(() => {
    if (isAuthChecking) return;
    if (isComplete) {
      const t = setTimeout(() => router.push(`/campaigns/${id}/results`), 1500);
      return () => clearTimeout(t);
    }
  }, [isComplete, id, router, isAuthChecking]);

  const handleCancel = async () => {
    if (confirm("Are you sure you want to stop this campaign?")) {
      setIsCancelling(true);
      setCancelError(null);
      try {
        await cancelCampaign(id);
      } catch (err) {
        setCancelError(err instanceof Error ? err.message : "Failed to stop campaign");
        setIsCancelling(false);
      }
    }
  };

  const rows = Object.values(statuses).sort((a, b) =>
    a.customer_name.localeCompare(b.customer_name)
  );
  const total = rows.length;
  const delivered = rows.filter((r) =>
    ["delivered", "opened", "read", "clicked", "purchased"].includes(r.status)
  ).length;
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;

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
      title="Live Delivery Tracker"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Campaigns", href: "/campaigns" },
        { label: `Campaign #${id}` }
      ]}
    >
      <div className="max-w-3xl mx-auto space-y-6">

        {/* State Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[18px] bg-surface border-none shadow-none">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-pill text-xs font-bold uppercase tracking-wider ${
                isComplete
                  ? "bg-green-light text-green"
                  : isCancelled
                  ? "bg-red-light text-red"
                  : isStalled
                  ? "bg-amber-light text-[#92400E]"
                  : "bg-accent-light text-accent animate-pulse"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isComplete
                    ? "bg-green"
                    : isCancelled
                    ? "bg-red"
                    : isStalled
                    ? "bg-amber"
                    : "bg-accent animate-ping"
                }`}
              />
              {isComplete
                ? "Campaign Complete — redirecting…"
                : isCancelled
                ? "Campaign Stopped"
                : isStalled
                ? "Campaign Stalled"
                : "Campaign Executing"}
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Campaign #{id}</p>
            </div>
          </div>
          <span className="text-xs text-text-muted font-bold uppercase tracking-wider">
            Real-time delivery updates
          </span>
        </div>

        {/* Alerts */}
        {isStalled && (
          <div className="p-4 rounded-[18px] bg-amber-light text-[#92400E] text-xs font-bold uppercase tracking-wider flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber" />
            This campaign appears to be stalled. The channel service may be unreachable.
          </div>
        )}

        {isCancelled && (
          <div className="p-4 rounded-[18px] bg-red-light text-red text-xs font-bold uppercase tracking-wider flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-red" />
            This campaign has been stopped. No further messages will be sent.
          </div>
        )}

        {cancelError && (
          <div className="p-4 rounded-[18px] bg-red-light text-red text-xs font-bold uppercase tracking-wider flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red" />
            {cancelError}
          </div>
        )}

        {error && !isComplete && !isCancelled && (
          <div className="p-4 rounded-[18px] bg-red-light text-red text-xs font-bold uppercase tracking-wider flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red" />
            {error}
          </div>
        )}

        {/* Progress Bar Card */}
        {total > 0 && (
          <div className="rounded-[18px] bg-surface p-5 border-none shadow-none">
            <div className="flex justify-between text-xs mb-2.5 font-bold uppercase tracking-wider">
              <span className="text-text-muted">Delivery Progress</span>
              <span className="text-green">
                {delivered} / {total} delivered
              </span>
            </div>
            <div className="h-3 rounded-full bg-white overflow-hidden border-none shadow-none">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-green transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-right text-xs font-bold uppercase tracking-wider text-text-muted mt-2">{pct}% delivered</p>
          </div>
        )}

        {/* Recipient status list */}
        <div className="rounded-[18px] bg-surface p-5 border-none shadow-none space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3.5">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
              Recipient Status{" "}
              {total > 0 && (
                <span className="ml-1 text-text-faint">({total})</span>
              )}
            </h2>
            {!isComplete && !isStalled && !isCancelled && (
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Live Feed
              </span>
            )}
            {isCancelled && (
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red">
                <span className="w-1.5 h-1.5 rounded-full bg-red" />
                Stopped
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-xs font-bold uppercase tracking-wider">
              <div className="mb-3.5">
                <Loader className="w-5 h-5 animate-spin text-accent mx-auto" />
              </div>
              Waiting for first delivery event…
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-none">
              {rows.map((row) => (
                <div
                  key={row.campaign_message_id}
                  className="flex items-center justify-between bg-white rounded-[18px] p-3.5 hover:bg-surface-hover transition-colors duration-150 border-none shadow-none animate-fadeIn"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center text-accent text-xs font-bold shrink-0">
                      {row.customer_name[0] ?? "?"}
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text truncate">
                        {row.customer_name}
                      </p>
                      {row.timestamp && (
                        <p className="text-xs font-bold text-text-faint uppercase mt-0.5">
                          {new Date(row.timestamp).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {/* Retry indicator */}
                    {row.is_retry && (
                      <span className="text-xs text-amber font-extrabold uppercase tracking-wider flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 text-amber animate-spin" /> retry
                      </span>
                    )}
                    <StatusBadge status={row.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions panel */}
        {!isComplete && !isCancelled && !isStalled && (
          <div className="flex items-center justify-between pt-4">
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="btn-danger h-11"
            >
              {isCancelling ? "Stopping..." : "Stop Campaign"}
            </button>

            <button
              onClick={() => router.push(`/campaigns/${id}/results`)}
              className="btn-primary h-11 flex items-center gap-1.5"
            >
              Skip to Results <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {(isComplete || isCancelled || isStalled) && (
          <div className="text-center pt-4">
            <Link
              href="/campaigns"
              className="btn-ghost inline-flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back to History
            </Link>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
