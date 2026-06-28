"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MessageCardList from "@/components/campaign/MessageCardList";
import LaunchButton from "@/components/campaign/LaunchButton";
import { getCampaign, isAuthenticated, createAudience } from "@/lib/api";
import type { CampaignDetailResponse } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { Loader, Edit } from "lucide-react";
import EditCampaignDrawer from "@/components/campaign/EditCampaignDrawer";
import { toast } from "sonner";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const router = useRouter();

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [campaign, setCampaign] = useState<CampaignDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasConcurrent, setHasConcurrent] = useState(false);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  // Save Segment as Audience States
  const [isSaveAudienceModalOpen, setIsSaveAudienceModalOpen] = useState(false);
  const [audienceName, setAudienceName] = useState("");
  const [audienceDescription, setAudienceDescription] = useState("");
  const [isSavingAudience, setIsSavingAudience] = useState(false);

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

    async function load() {
      try {
        const camp = await getCampaign(campaignId);
        setCampaign(camp);
        setAudienceName(camp.name ? `${camp.name} Audience` : "New Saved Audience");
        setAudienceDescription(camp.intent ? `Targeting segment group for: ${camp.intent}` : "");
        setHasConcurrent(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load campaign.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId, isAuthChecking]);

  function handleLaunched() {
    router.push(`/campaigns/${campaignId}/tracker`);
  }

  async function handleSaveAudience(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign?.segment) return;
    setIsSavingAudience(true);
    try {
      await createAudience(audienceName, audienceDescription, campaign.segment.filter_criteria);
      toast.success("Audience saved successfully!");
      setIsSaveAudienceModalOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save audience.");
    } finally {
      setIsSavingAudience(false);
    }
  }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted font-bold text-xs uppercase tracking-wider">
          <Loader className="w-5 h-5 animate-spin text-accent" />
          Loading campaign details…
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="text-center p-8 bg-surface rounded-[18px] max-w-sm w-full">
          <p className="text-red font-bold mb-4">{error ?? "Campaign not found."}</p>
          <button
            onClick={() => router.push("/campaigns")}
            className="btn-primary w-full h-11"
          >
            Back to History
          </button>
        </div>
      </div>
    );
  }

  const headerActions = (
    <button
      onClick={() => setIsEditDrawerOpen(true)}
      className="btn-secondary h-11 flex items-center justify-center gap-2 cursor-pointer"
    >
      <Edit className="w-4 h-4 text-text-muted" />
      Edit Settings
    </button>
  );

  return (
    <PageWrapper
      title="Review Campaign"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Campaigns", href: "/campaigns" },
        { label: campaign.name }
      ]}
      actions={headerActions}
    >
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start">
        
        {/* Left Column (30% width) - Controls, stats, segment, launch */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Review Banner */}
          <div className="rounded-[18px] bg-surface p-5 border-none shadow-none space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-amber-light text-amber text-xs font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
              Awaiting Your Review
            </div>
            <p className="text-xs text-text-muted leading-relaxed font-semibold">
              Review generated personalized copies before launching. You can click on any card to edit the text inline.
            </p>
          </div>

          {/* Segment Summary */}
          {campaign.segment && (
            <div className="rounded-[18px] bg-surface p-5 border-none shadow-none space-y-4">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs text-text-muted uppercase tracking-wider font-extrabold">
                    Audience Segment Criteria
                  </p>
                  <button
                    onClick={() => setIsSaveAudienceModalOpen(true)}
                    className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                  >
                    Save as Audience
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.segment.filter_criteria.map((f, i) => (
                    <span key={i} className="px-2.5 py-1.5 rounded-pill bg-white text-xs font-mono font-bold text-text-muted">
                      {f.field} {f.operator} <span className="text-accent">{Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}</span>
                    </span>
                  ))}
                </div>
              </div>

              {campaign.segment.sample_customers.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-text-muted uppercase tracking-wider font-extrabold mb-2.5">Recipients Sample:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {campaign.segment.sample_customers.slice(0, 4).map((c) => (
                      <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-white text-xs font-bold text-text">
                        <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-xs text-white">
                          {c.name.charAt(0)}
                        </span>
                        {c.name}
                      </div>
                    ))}
                    {campaign.segment.customer_count > 4 && (
                      <span className="text-xs text-text-muted font-bold self-center pl-1">
                        +{campaign.segment.customer_count - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-4 flex items-center justify-between">
                <span className="text-xs text-text-muted uppercase tracking-wider font-extrabold">Total Recipients</span>
                <span className="badge-success text-xs">
                  {campaign.segment.customer_count} Recipient{campaign.segment.customer_count === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          )}

          {/* Campaign Intent */}
          <div className="rounded-[18px] bg-surface p-5 border-none shadow-none space-y-2">
            <span className="text-xs text-text-muted uppercase tracking-wider font-extrabold">Campaign Intent</span>
            <p className="text-xs text-text font-medium leading-relaxed italic">
              &ldquo;{campaign.intent}&rdquo;
            </p>
          </div>

          {/* Launch Controls Card */}
          <div className="rounded-[18px] bg-surface p-5 border-none shadow-none space-y-4">
            <div>
              <p className="text-xs font-bold text-text mb-1">Ready to dispatch?</p>
              <p className="text-xs text-text-muted font-bold leading-relaxed uppercase tracking-wider">
                {campaign.segment?.customer_count ?? 0} messages will be dispatched immediately.
              </p>
            </div>
            <div className="pt-2">
              <LaunchButton
                campaignId={campaignId}
                recipientCount={campaign.segment?.customer_count ?? 0}
                isConcurrentRunning={hasConcurrent}
                onLaunched={handleLaunched}
              />
            </div>
          </div>

        </div>

        {/* Right Column (70% width) - Editable message list */}
        <div className="lg:col-span-7">
          <MessageCardList campaign={campaign} />
        </div>

      </div>

      <EditCampaignDrawer
        isOpen={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
        campaign={campaign}
        onUpdate={(updated) => setCampaign(updated)}
      />

      {/* Save Audience Modal Overlay */}
      {isSaveAudienceModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md z-[100] flex items-center justify-center animate-fadeIn">
          <div className="bg-surface p-6 rounded-[22px] max-w-sm w-full mx-4 border border-border/40 shadow-xl animate-scaleUp">
            <h3 className="text-sm font-extrabold text-text mb-1.5 uppercase tracking-wider">Save Segment as Audience</h3>
            <p className="text-xs text-text-muted mb-4 font-semibold leading-relaxed">
              Create a reusable audience from these segment filters so you can easily target them in future campaigns.
            </p>
            <form onSubmit={handleSaveAudience} className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-text-muted uppercase tracking-wider mb-1.5">
                  Audience Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High Value Active Customers"
                  value={audienceName}
                  onChange={(e) => setAudienceName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent-light"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-text-muted uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Describe this segment group..."
                  value={audienceDescription}
                  onChange={(e) => setAudienceDescription(e.target.value)}
                  className="w-full min-h-[80px] p-3 rounded-xl border border-border bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent-light resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveAudienceModalOpen(false)}
                  className="btn-ghost flex-1 h-11 bg-bg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAudience}
                  className="btn-primary flex-1 h-11 inline-flex items-center justify-center gap-1.5"
                >
                  {isSavingAudience ? "Saving..." : "Save Audience"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
