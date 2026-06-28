"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAudiences,
  previewAudience,
  createAudience,
  isAuthenticated,
} from "@/lib/api";
import type { AudienceResponse, FilterCriterion } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import {
  Users,
  Plus,
  Trash2,
  Play,
  Loader,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";

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

export default function AudiencesPage() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [audiences, setAudiences] = useState<AudienceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<FilterCriterion[]>([]);
  
  // Preview / estimation states
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReach, setPreviewReach] = useState<number | null>(null);
  const [sampleCustomers, setSampleCustomers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  const fetchAudiences = async () => {
    try {
      setLoading(true);
      const res = await getAudiences();
      setAudiences(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audiences.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthChecking) return;
    fetchAudiences();
  }, [isAuthChecking]);

  // Debounced preview trigger
  useEffect(() => {
    if (isAuthChecking || criteria.length === 0) {
      setPreviewReach(null);
      setSampleCustomers([]);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const preview = await previewAudience(criteria);
        setPreviewReach(preview.customer_count);
        setSampleCustomers(preview.sample_customers);
      } catch (err) {
        console.error("Preview failed:", err);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [criteria, isAuthChecking]);

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
        
        // If field changed, reset operator and value appropriately
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

  const handleSaveAudience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter an audience name.");
      return;
    }
    if (criteria.length === 0) {
      toast.error("Please add at least one filter rule.");
      return;
    }

    try {
      setSaveLoading(true);
      await createAudience(name, description, criteria);
      toast.success(`Audience "${name}" saved successfully!`);
      setName("");
      setDescription("");
      setCriteria([]);
      fetchAudiences();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save audience.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTargetAudience = (audienceId: number) => {
    router.push(`/campaigns/new?audience_id=${audienceId}`);
  };

  return (
    <PageWrapper
      title="Audience Workspace"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Audiences" }
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Interactive Criteria Builder */}
        <div className="lg:col-span-8 space-y-6">
          <div className="rounded-[18px] bg-white border border-border p-6 shadow-sm">
            <h2 className="text-sm font-extrabold text-text tracking-tight mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent" />
              Define Audience Segment
            </h2>

            <form onSubmit={handleSaveAudience} className="space-y-6">
              {/* Audience Identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="audience-name" className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                    Audience Name *
                  </label>
                  <input
                    id="audience-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. High Value Churn Risks"
                    className="global-input h-11 focus:ring-accent-light"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="audience-desc" className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                    Description
                  </label>
                  <input
                    id="audience-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Premium members with zero orders in 30 days"
                    className="global-input h-11 focus:ring-accent-light"
                  />
                </div>
              </div>

              {/* Rules Builder */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    Target Criteria Rules ({criteria.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="btn-ghost h-9 px-3 text-xs flex items-center gap-1.5 hover:scale-[1.02]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Condition
                  </button>
                </div>

                {criteria.length === 0 ? (
                  <div className="rounded-[18px] border-2 border-dashed border-border py-8 text-center text-text-muted flex flex-col items-center justify-center">
                    <Search className="w-8 h-8 text-text-faint mb-2" />
                    <p className="text-xs font-semibold">No filter rules added yet.</p>
                    <p className="text-[10px] font-medium text-text-faint mt-1 max-w-xs leading-relaxed">
                      Add a filter rule below to define who will match this audience segment.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddRule}
                      className="btn-primary h-9 px-4 text-xs mt-4"
                    >
                      + Add Rule
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {criteria.map((rule, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col md:flex-row items-start md:items-center gap-3 p-4 bg-surface rounded-[18px] relative group border border-transparent hover:border-border transition-all"
                      >
                        {/* Selector Field */}
                        <div className="w-full md:w-1/3 space-y-1">
                          <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Attribute</label>
                          <select
                            value={rule.field}
                            onChange={(e) => handleUpdateRule(idx, { field: e.target.value })}
                            className="w-full bg-white border border-border rounded-pill px-4 h-10 text-xs font-bold text-text focus:outline-none focus:ring-2 focus:ring-accent-light"
                          >
                            {FIELD_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Selector Operator */}
                        <div className="w-full md:w-1/4 space-y-1">
                          <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Operator</label>
                          <select
                            value={rule.operator}
                            onChange={(e) => handleUpdateRule(idx, { operator: e.target.value })}
                            className="w-full bg-white border border-border rounded-pill px-4 h-10 text-xs font-bold text-text focus:outline-none focus:ring-2 focus:ring-accent-light"
                          >
                            {(OPERATOR_OPTIONS[rule.field] || []).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Input Value */}
                        <div className="w-full md:flex-1 space-y-1">
                          <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Value</label>
                          {rule.field === "subscription_tier" ? (
                            <select
                              value={String(rule.value)}
                              onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                              className="w-full bg-white border border-border rounded-pill px-4 h-10 text-xs font-bold text-text focus:outline-none focus:ring-2 focus:ring-accent-light"
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
                              placeholder={rule.field === "lifetime_value" ? "e.g. 500" : rule.field === "last_order_date" ? "e.g. 30" : "Enter value..."}
                              className="w-full bg-white border border-border rounded-pill px-4 h-10 text-xs font-bold text-text focus:outline-none focus:ring-2 focus:ring-accent-light"
                            />
                          )}
                        </div>

                        {/* Trash */}
                        <button
                          type="button"
                          onClick={() => handleRemoveRule(idx)}
                          className="absolute md:relative top-4 right-4 md:top-auto md:right-auto w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-red hover:bg-red-light cursor-pointer transition-all shrink-0 mt-4 md:mt-4"
                          aria-label="Remove condition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t border-border">
                <button
                  type="submit"
                  disabled={saveLoading || criteria.length === 0}
                  className={`btn-primary h-11 flex-1 flex items-center justify-center gap-2 ${
                    saveLoading || criteria.length === 0 ? "opacity-50 cursor-not-allowed scale-100 hover:scale-100" : ""
                  }`}
                >
                  {saveLoading && <Loader className="w-4 h-4 animate-spin" />}
                  Save Audience Segment
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Reach Estimator & Saved Audiences List */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Estimated Reach Panel */}
          {criteria.length > 0 && (
            <div className="rounded-[18px] bg-white border border-border p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-extrabold text-text tracking-tight uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                Live Segment Preview
              </h3>

              {previewLoading ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2.5 text-text-muted">
                  <RefreshCw className="w-5 h-5 animate-spin text-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Recalculating reach…</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Big Number */}
                  <div className="bg-surface rounded-[18px] p-4 text-center">
                    <span className="text-3xl font-extrabold text-text tracking-tight">
                      {previewReach !== null ? previewReach.toLocaleString() : "0"}
                    </span>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-1">
                      Matched Customers
                    </p>
                  </div>

                  {/* Large Segment Warning */}
                  {previewReach !== null && previewReach > 25 && (
                    <div className="rounded-xl bg-amber-light p-3.5 flex items-start gap-2.5 border-none">
                      <AlertCircle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                      <p className="text-[10px] font-semibold text-amber leading-relaxed">
                        Large Audience: Generating personalized outreach messages via AI may take several seconds.
                      </p>
                    </div>
                  )}

                  {/* Sample Customers */}
                  {sampleCustomers.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider pl-1">
                        Sample Customers Match:
                      </p>
                      <div className="space-y-1.5">
                        {sampleCustomers.map((c) => (
                          <div key={c.id} className="rounded-xl border border-border/70 p-2.5 flex justify-between items-center bg-white/50">
                            <div>
                              <p className="text-xs font-bold text-text leading-tight">{c.name}</p>
                              <p className="text-[10px] text-text-muted truncate mt-0.5 max-w-[150px]">{c.email}</p>
                            </div>
                            <span className="text-[9px] font-bold text-text-faint px-2 py-0.5 rounded-pill bg-surface border">ID: {c.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Saved Audiences List */}
          <div className="rounded-[18px] bg-white border border-border p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold text-text tracking-tight uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald" />
              Saved Reusable Audiences
            </h3>

            {loading ? (
              <div className="py-6 text-center text-text-muted animate-pulse">
                <Loader className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Loading saved lists…</span>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-red-light p-3 text-red text-[11px] font-semibold">
                {error}
              </div>
            ) : audiences.length === 0 ? (
              <p className="text-xs text-text-muted font-medium text-center py-6">
                No saved audiences found. Build one on the left to reuse it later!
              </p>
            ) : (
              <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                {audiences.map((aud) => (
                  <div
                    key={aud.id}
                    className="group border border-border/80 hover:border-accent/40 rounded-[18px] p-4 bg-white hover:bg-surface transition-all duration-200"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-extrabold text-text group-hover:text-accent transition-colors">
                          {aud.name}
                        </h4>
                        <p className="text-[10px] text-text-muted font-medium mt-0.5 leading-relaxed">
                          {aud.description || "No description provided."}
                        </p>
                      </div>
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-pill bg-accent-light text-accent shrink-0">
                        {aud.customer_count} Reach
                      </span>
                    </div>

                    {/* Criteria tags summary */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {aud.filter_criteria.map((c, cIdx) => (
                        <span key={cIdx} className="text-[9px] font-mono font-bold text-text-faint px-2 py-0.5 bg-surface border rounded-pill">
                          {c.field === "subscription_tier" ? "Tier" : c.field === "roast_preference" ? "Roast" : c.field === "last_order_date" ? "Days Ago" : c.field}: {String(c.value)}
                        </span>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-border/40">
                      <button
                        onClick={() => handleTargetAudience(aud.id)}
                        className="btn-primary text-[10px] h-8 px-3.5 flex items-center gap-1 cursor-pointer w-full justify-center"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Target Campaign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </PageWrapper>
  );
}
