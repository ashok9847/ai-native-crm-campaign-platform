"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAudiences, previewAudience, updateCampaign } from "@/lib/api";
import type { AudienceResponse, CampaignDetailResponse, FilterCriterion } from "@/lib/types";
import { X, Loader, Plus, Trash2, Users, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface EditCampaignDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: CampaignDetailResponse;
  onUpdate: (updatedCampaign: CampaignDetailResponse) => void;
}

const FIELD_OPTIONS = [
  { value: "subscription_tier", label: "Subscription Tier" },
  { value: "roast_preference", label: "Roast Preference" },
  { value: "city", label: "City" },
  { value: "lifetime_value", label: "Lifetime Value ($)" },
  { value: "last_order_date", label: "Last Order Date (Days Ago)" },
];

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  subscription_tier: [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Not Equals" },
  ],
  roast_preference: [
    { value: "eq", label: "Equals" },
    { value: "contains", label: "Contains" },
  ],
  city: [
    { value: "eq", label: "Equals" },
    { value: "contains", label: "Contains" },
  ],
  lifetime_value: [
    { value: "gt", label: "Greater Than (>)" },
    { value: "lt", label: "Less Than (<)" },
    { value: "gte", label: "Greater Than or Equal (>=)" },
    { value: "lte", label: "Less Than or Equal (<=)" },
  ],
  last_order_date: [
    { value: "lte_days_ago", label: "Days Ago or More" },
  ],
};

const VALUE_TIERS = ["starter", "premium", "elite"];

export default function EditCampaignDrawer({
  isOpen,
  onClose,
  campaign,
  onUpdate,
}: EditCampaignDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [name, setName] = useState(campaign.name);
  const [channel, setChannel] = useState(campaign.channel);
  const [scheduledAt, setScheduledAt] = useState<string>(
    campaign.scheduled_at
      ? new Date(campaign.scheduled_at).toISOString().slice(0, 16)
      : ""
  );

  // Audience choices
  const [audiences, setAudiences] = useState<AudienceResponse[]>([]);
  const [targetType, setTargetType] = useState<"saved" | "custom">(
    campaign.audience_id ? "saved" : "custom"
  );
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>(
    campaign.audience_id ? String(campaign.audience_id) : ""
  );
  
  // Custom criteria builder
  const [criteria, setCriteria] = useState<FilterCriterion[]>(
    campaign.segment?.filter_criteria || []
  );

  // Estimator preview states
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReach, setPreviewReach] = useState<number | null>(
    campaign.segment?.customer_count ?? null
  );
  const [saveLoading, setSaveLoading] = useState(false);

  // Load audiences list on mount
  useEffect(() => {
    getAudiences()
      .then((res) => setAudiences(res.items))
      .catch((err) => console.error("Failed to load audiences:", err));
  }, []);

  // Recalculate preview reach when criteria or selected audience changes
  useEffect(() => {
    if (targetType === "saved" && selectedAudienceId) {
      const selected = audiences.find((a) => String(a.id) === selectedAudienceId);
      if (selected) {
        setPreviewReach(selected.customer_count);
      }
      return;
    }

    if (targetType === "custom" && criteria.length > 0) {
      const timer = setTimeout(async () => {
        setPreviewLoading(true);
        try {
          const preview = await previewAudience(criteria);
          setPreviewReach(preview.customer_count);
        } catch (err) {
          console.error("Preview failed:", err);
        } finally {
          setPreviewLoading(false);
        }
      }, 500);

      return () => clearTimeout(timer);
    }

    if (targetType === "custom" && criteria.length === 0) {
      setPreviewReach(0);
    }
  }, [targetType, selectedAudienceId, criteria, audiences]);

  if (!isOpen || !mounted) return null;

  const handleAddRule = () => {
    const defaultField = "subscription_tier";
    setCriteria((prev) => [
      ...prev,
      {
        field: defaultField,
        operator: OPERATOR_OPTIONS[defaultField][0].value,
        value: "premium",
      },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRule = (index: number, updates: Partial<FilterCriterion>) => {
    setCriteria((prev) =>
      prev.map((rule, i) => {
        if (i !== index) return rule;
        const next = { ...rule, ...updates };
        if (updates.field) {
          const fieldType = updates.field;
          const allowedOps = OPERATOR_OPTIONS[fieldType] || [];
          next.operator = allowedOps[0]?.value || "eq";
          if (fieldType === "subscription_tier") {
            next.value = "premium";
          } else if (fieldType === "lifetime_value" || fieldType === "last_order_date") {
            next.value = 30;
          } else {
            next.value = "";
          }
        }
        return next;
      })
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a campaign name.");
      return;
    }

    try {
      setSaveLoading(true);
      const params: any = {
        name,
        channel,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };

      if (targetType === "saved") {
        if (!selectedAudienceId) {
          toast.error("Please select a saved audience.");
          setSaveLoading(false);
          return;
        }
        params.audience_id = Number(selectedAudienceId);
      } else {
        if (criteria.length === 0) {
          toast.error("Please add at least one filter rule.");
          setSaveLoading(false);
          return;
        }
        params.filter_criteria = criteria;
        params.audience_id = null;
      }

      const updated = await updateCampaign(campaign.id, params);
      toast.success("Campaign updated and messages regenerated!");
      onUpdate(updated);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update campaign.");
    } finally {
      setSaveLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-hidden animate-fadeIn">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-border shadow-2xl flex flex-col animate-slideInRight">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-text tracking-tight">
                Edit Campaign Settings
              </h3>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mt-0.5">
                Regenerates Segment & Copies
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface text-text-muted cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Identity fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                  Campaign Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="global-input h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                    Channel Type
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full bg-white border border-border rounded-pill px-4 h-11 text-xs font-bold text-text focus:outline-none focus:ring-2 focus:ring-accent-light"
                  >
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="rcs">RCS</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                    Scheduled Dispatch
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="global-input h-11 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Target Audience selection toggle */}
            <div className="space-y-3 pt-4 border-t border-border">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                Target Audience Selection
              </label>
              <div className="flex bg-surface rounded-pill p-1">
                <button
                  type="button"
                  onClick={() => setTargetType("saved")}
                  className={`flex-1 text-center py-2 text-xs font-extrabold rounded-pill transition-all cursor-pointer border-none ${
                    targetType === "saved"
                      ? "bg-white text-text shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Saved Audience
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("custom")}
                  className={`flex-1 text-center py-2 text-xs font-extrabold rounded-pill transition-all cursor-pointer border-none ${
                    targetType === "custom"
                      ? "bg-white text-text shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Custom Segment
                </button>
              </div>
            </div>

            {/* Saved audience select */}
            {targetType === "saved" && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                  Select Reusable Audience
                </label>
                {audiences.length === 0 ? (
                  <p className="text-xs text-text-muted italic">No saved audiences found.</p>
                ) : (
                  <select
                    value={selectedAudienceId}
                    onChange={(e) => setSelectedAudienceId(e.target.value)}
                    className="w-full bg-white border border-border rounded-pill px-4 h-11 text-xs font-bold text-text focus:outline-none focus:ring-2 focus:ring-accent-light"
                  >
                    <option value="">-- Choose saved list --</option>
                    {audiences.map((aud) => (
                      <option key={aud.id} value={aud.id}>
                        {aud.name} (Reach: {aud.customer_count})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Custom filters builder */}
            {targetType === "custom" && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    Custom Criteria Rules ({criteria.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="btn-ghost h-8 px-2 text-xs flex items-center gap-1"
                  >
                    + Add Rule
                  </button>
                </div>

                <div className="space-y-3">
                  {criteria.map((rule, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-surface rounded-[18px] relative border border-border/50 space-y-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        className="absolute top-3 right-3 text-text-muted hover:text-red p-1 rounded-full hover:bg-red-light cursor-pointer border-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="space-y-1.5 pr-8">
                        <label className="text-[9px] font-bold text-text-muted uppercase block">Attribute</label>
                        <select
                          value={rule.field}
                          onChange={(e) => handleUpdateRule(idx, { field: e.target.value })}
                          className="w-full bg-white border rounded-pill px-3 h-8 text-xs font-bold text-text focus:outline-none"
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pr-8">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-text-muted uppercase block">Operator</label>
                          <select
                            value={rule.operator}
                            onChange={(e) => handleUpdateRule(idx, { operator: e.target.value })}
                            className="w-full bg-white border rounded-pill px-3 h-8 text-xs font-bold text-text focus:outline-none"
                          >
                            {(OPERATOR_OPTIONS[rule.field] || []).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-text-muted uppercase block">Value</label>
                          {rule.field === "subscription_tier" ? (
                            <select
                              value={String(rule.value)}
                              onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                              className="w-full bg-white border rounded-pill px-3 h-8 text-xs font-bold text-text focus:outline-none"
                            >
                              {VALUE_TIERS.map((tier) => (
                                <option key={tier} value={tier}>
                                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={rule.field === "lifetime_value" || rule.field === "last_order_date" ? "number" : "text"}
                              value={String(rule.value)}
                              onChange={(e) => {
                                const val = e.target.value;
                                const parsed = rule.field === "lifetime_value" || rule.field === "last_order_date" ? Number(val) : val;
                                handleUpdateRule(idx, { value: parsed });
                              }}
                              className="w-full bg-white border rounded-pill px-3 h-8 text-xs font-bold text-text focus:outline-none"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live reach count preview */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-accent" />
                  Estimated Reach
                </span>
                {previewLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <span className="badge-success text-[10px]">
                    {previewReach !== null ? `${previewReach} customers` : "0 customers"}
                  </span>
                )}
              </div>

              {previewReach !== null && previewReach > 25 && (
                <div className="rounded-xl bg-amber-light p-3 flex items-start gap-2 border-none">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                  <p className="text-[9px] font-semibold text-amber leading-relaxed">
                    Message generation for more than 25 recipients might take a few seconds to run.
                  </p>
                </div>
              )}
            </div>

          </form>

          {/* Footer Save Button */}
          <div className="p-4 border-t border-border bg-white flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost flex-1 h-11 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSave}
              disabled={saveLoading}
              className={`btn-primary flex-1 h-11 flex items-center justify-center gap-2 cursor-pointer ${
                saveLoading ? "opacity-50 cursor-not-allowed scale-100 hover:scale-100" : ""
              }`}
            >
              {saveLoading && <Loader className="w-4 h-4 animate-spin" />}
              Save & Regenerate
            </button>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
