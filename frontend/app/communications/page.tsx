"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCommunications, isAuthenticated, getProfile } from "@/lib/api";
import type {
  CommunicationsResponse,
  UserProfileResponse,
} from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { Smartphone, Mail, MessageCircle, Bell, HelpCircle, Loader, ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_BADGES: Record<string, string> = {
  pending: "badge-pending",
  sent: "badge-pending",
  delivered: "badge-success",
  opened: "badge-running",
  read: "badge-running",
  clicked: "badge-blue",
  purchased: "badge-success",
  failed: "badge-failed",
};

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "sms":
      return <Smartphone className="w-4 h-4 text-[#1558C0]" />;
    case "email":
      return <Mail className="w-4 h-4 text-[#1558C0]" />;
    case "whatsapp":
      return <MessageCircle className="w-4 h-4 text-[#166534]" />;
    case "rcs":
      return <Bell className="w-4 h-4 text-[#92400E]" />;
    default:
      return <HelpCircle className="w-4 h-4 text-text-faint" />;
  }
}

export default function CommunicationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CommunicationsResponse | null>(null);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    async function load() {
      try {
        const [profData, commsData] = await Promise.all([
          getProfile(),
          getCommunications(page, 50, statusFilter || undefined),
        ]);
        setProfile(profData);
        setData(commsData);
      } catch (err: any) {
        setError(err.message || "Failed to load communications.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, page, statusFilter]);

  if (loading) {
    return (
      <PageWrapper title="Communications">
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
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
          <button
            onClick={() => window.location.reload()}
            className="btn-primary w-full h-11"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0;

  const headerActions = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5 flex-wrap bg-surface p-1 rounded-pill">
        {["", "sent", "delivered", "opened", "clicked", "purchased", "failed"].map(
          (s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
                setLoading(true);
              }}
              className={`px-3.5 h-8 rounded-pill text-xs font-bold uppercase tracking-wider transition-all border-none cursor-pointer flex items-center justify-center ${
                statusFilter === s
                  ? "bg-accent text-white"
                  : "bg-transparent text-text-muted hover:text-text"
              }`}
            >
              {s ? s : "ALL"}
            </button>
          )
        )}
      </div>
      <Link
        href="/delivery"
        className="btn-primary flex items-center gap-1.5 px-4 h-10 text-xs font-bold shrink-0"
      >
        Delivery Health →
      </Link>
    </div>
  );

  return (
    <PageWrapper
      title="Communications"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Communications" }
      ]}
      actions={headerActions}
    >
      <div className="space-y-6">

        {/* Messages Table */}
        <div className="rounded-[18px] bg-surface overflow-hidden border-none shadow-none">
          <div className="overflow-x-auto">
            <table className="global-table">
              <thead className="global-table-thead">
                <tr>
                  <th className="global-table-th">Channel</th>
                  <th className="global-table-th">Customer</th>
                  <th className="global-table-th">Campaign</th>
                  <th className="global-table-th">Message</th>
                  <th className="global-table-th">Status</th>
                  <th className="global-table-th">Sent</th>
                </tr>
              </thead>
              <tbody>
                {data?.items && data.items.length > 0 ? (
                  data.items.map((item) => {
                    let campaignUrl = `/campaigns/${item.campaign_id}`;
                    if (item.campaign_state === "COMPLETE") {
                      campaignUrl = `/campaigns/${item.campaign_id}/results`;
                    } else if (item.campaign_state === "EXECUTING" || item.campaign_state === "CANCELLED") {
                      campaignUrl = `/campaigns/${item.campaign_id}/tracker`;
                    } else if (item.campaign_state === "REVIEWING") {
                      campaignUrl = `/campaigns/${item.campaign_id}/review`;
                    }

                    return (
                      <tr
                        key={item.id}
                        className="global-table-tr"
                      >
                        <td className="global-table-td">
                          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white">
                            <ChannelIcon channel={item.channel} />
                          </span>
                        </td>
                        <td className="global-table-td">
                          {item.customer_id ? (
                            <Link
                              href={`/customers`}
                              className="text-xs font-bold text-text hover:text-accent hover:underline transition-colors"
                            >
                              {item.customer_name}
                            </Link>
                          ) : (
                            <span className="text-xs font-bold text-text">
                              {item.customer_name}
                            </span>
                          )}
                        </td>
                        <td className="global-table-td">
                          {item.campaign_id ? (
                            <Link
                              href={campaignUrl}
                              className="text-xs text-accent hover:underline transition-colors font-bold"
                            >
                              {item.campaign_name}
                            </Link>
                          ) : (
                            <span className="text-xs text-text-muted font-bold">
                              {item.campaign_name}
                            </span>
                          )}
                        </td>
                        <td className="global-table-td max-w-[200px]">
                          <p className="truncate text-xs text-text-muted font-medium" title={item.body}>
                            {item.body}
                          </p>
                        </td>
                        <td className="global-table-td">
                          <span className={STATUS_BADGES[item.status] || "badge-pending"}>
                            {item.status}
                          </span>
                        </td>
                        <td className="global-table-td text-xs text-text-muted font-bold tabular-nums">
                          {item.queued_at
                            ? new Date(item.queued_at).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-text-muted font-bold uppercase tracking-wider text-xs">
                      No communications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="btn-ghost px-4 h-10 flex items-center gap-1.5 text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-xs text-text-muted font-bold uppercase tracking-wider">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="btn-ghost px-4 h-10 flex items-center gap-1.5 text-xs font-bold"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
