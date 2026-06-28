"use client";

import { useState, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import ChatInput from "@/components/campaign/ChatInput";
import LiveBuildDashboard from "@/components/campaign/LiveBuildDashboard";
import { listCampaigns, isAuthenticated } from "@/lib/api";
import type { FilterCriterion } from "@/lib/types";
import PageWrapper from "@/components/layout/PageWrapper";
import { Sparkles } from "lucide-react";

interface StreamMessage {
  customer_id: number;
  customer_name: string;
  subscription_tier: string;
  body: string;
  complete: boolean;
}

function NewCampaign() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillIntent = searchParams.get("intent") ?? "";
  const prefillAudienceId = searchParams.get("audience_id") ? Number(searchParams.get("audience_id")) : null;
  const prefillChannel = searchParams.get("channel") ?? "sms";
  
  const prefillCustomerIds = (searchParams.get("customer_ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [runningCampaignId, setRunningCampaignId] = useState<number | null>(null);

  // Authenticated route guard
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    } else {
      setIsAuthChecking(false);
    }
  }, [router]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-submit if prefilled intent or audience_id is passed
  useEffect(() => {
    if ((prefillIntent || prefillAudienceId) && !isAuthChecking) {
      const timer = setTimeout(() => {
        if (prefillAudienceId) {
          handleSubmit("Targeting saved audience", prefillChannel);
        } else {
          handleSubmit(prefillIntent, prefillChannel);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [prefillIntent, prefillAudienceId, isAuthChecking, prefillChannel]);
  const [campaignId, setCampaignId] = useState<number | null>(null);

  // Streaming states
  const [currentStep, setCurrentStep] = useState<"idle" | "draft" | "segmenting" | "generating" | "complete" | "error" | "clarifying">("idle");
  const [statusText, setStatusText] = useState("");
  const [filters, setFilters] = useState<FilterCriterion[]>([]);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [sampleCustomers, setSampleCustomers] = useState<{ id: number; name: string; email: string; subscription_tier?: string }[]>([]);
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([]);
  const [submittedIntent, setSubmittedIntent] = useState("");
  const [submittedChannel, setSubmittedChannel] = useState("sms");
  const [submittedScheduledAt, setSubmittedScheduledAt] = useState<string | null>(null);

  // Clarification states
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [clarificationOptions, setClarificationOptions] = useState<string[]>([]);
  const [customClarification, setCustomClarification] = useState("");
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);

  async function handleSubmit(
    intent: string,
    channel: string = "sms",
    scheduledAt: string | null = null,
    existingCampaignId: number | null = null,
    clarificationText: string | null = null
  ) {
    setSubmittedIntent(intent);
    setSubmittedChannel(channel);
    setSubmittedScheduledAt(scheduledAt);
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setRunningCampaignId(null);
    setCampaignId(existingCampaignId || null);

    if (!existingCampaignId) {
      setClarificationQuestion(null);
      setClarificationOptions([]);
      setCustomClarification("");
      setSelectedOptionIndex(null);
    }

    setCurrentStep("draft");
    setStatusText("Initializing campaign setup...");
    setFilters([]);
    setCustomerCount(null);
    setSampleCustomers([]);
    setStreamMessages([]);

    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
      const token = typeof window !== "undefined" ? localStorage.getItem("nudge_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${BASE_URL}/api/v1/campaigns/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          intent,
          customer_ids: prefillCustomerIds.length ? prefillCustomerIds : undefined,
          channel,
          scheduled_at: scheduledAt,
          campaign_id: existingCampaignId || undefined,
          clarification: clarificationText || undefined,
          audience_id: prefillAudienceId || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = body?.code ?? "UNKNOWN_ERROR";
        const message = body?.detail ?? "Failed to initialize pipeline.";
        throw Object.assign(new Error(message), { code, status: response.status });
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream received from server.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }

          const { event, ...data } = parsed;

          if (event === "draft_created") {
            setCampaignId(data.campaign_id);
            setCurrentStep("draft");
            setStatusText(`Created draft campaign: "${data.name}"`);
          } else if (event === "clarification_needed") {
            setCampaignId(data.campaign_id);
            setClarificationQuestion(data.question);
            setClarificationOptions(data.options);
            setCurrentStep("clarifying");
            setLoading(false);
            return;
          } else if (event === "segmenting_started") {
            setCurrentStep("segmenting");
            setStatusText("Analyzing intent & extracting audience segment filters...");
          } else if (event === "filters_extracted") {
            setFilters(data.filters);
            setStatusText("Audience segment filters extracted successfully.");
          } else if (event === "segment_resolved") {
            setCustomerCount(data.customer_count);
            setSampleCustomers(data.sample_customers);
            setStatusText(`Audited segment: matched ${data.customer_count} customer(s).`);
          } else if (event === "generating_started") {
            setCurrentStep("generating");
            setStatusText("Personalizing campaign outreach messages with Kimi AI...");
          } else if (event === "message_start") {
            setStreamMessages((prev) => [
              ...prev,
              {
                customer_id: data.customer_id,
                customer_name: data.customer_name,
                subscription_tier: data.subscription_tier,
                body: "",
                complete: false,
              },
            ]);
            setStatusText(`Writing message for ${data.customer_name}...`);
          } else if (event === "message_delta") {
            setStreamMessages((prev) =>
              prev.map((msg) =>
                msg.customer_id === data.customer_id
                  ? { ...msg, body: msg.body + data.delta }
                  : msg
              )
            );
          } else if (event === "message_complete") {
            setStreamMessages((prev) =>
              prev.map((msg) =>
                msg.customer_id === data.customer_id
                  ? { ...msg, body: data.message, complete: true }
                  : msg
              )
            );
          } else if (event === "campaign_complete") {
            setCurrentStep("complete");
            setCampaignId(data.campaign_id);
            setStatusText("Campaign created and personalized successfully!");
            setLoading(false);
          } else if (event === "error") {
            throw Object.assign(new Error(data.message), { code: data.code });
          }
        }
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; code?: string };
      setCurrentStep("error");
      const msg = errorObj.message || "Something went wrong. Please try again.";
      const code = errorObj.code ?? null;
      setError(msg);
      setErrorCode(code);
      setLoading(false);

      if (code === "CAMPAIGN_ALREADY_EXECUTING") {
        try {
          const { items } = await listCampaigns(1, 10);
          const executing = items.find((c) => c.state === "EXECUTING");
          if (executing) setRunningCampaignId(executing.id);
        } catch {
          // Ignore
        }
      }
    }
  }

  const handleSelectOption = (option: string, index: number) => {
    setSelectedOptionIndex(index);
    setCustomClarification(option);
  };

  const handleClarificationSubmit = () => {
    if (!customClarification.trim()) return;
    const textToSend = customClarification;
    setClarificationQuestion(null);
    setClarificationOptions([]);
    setCustomClarification("");
    setSelectedOptionIndex(null);
    handleSubmit(submittedIntent, submittedChannel, submittedScheduledAt, campaignId, textToSend);
  };

  const handleCancelClarification = () => {
    setCurrentStep("idle");
    setClarificationQuestion(null);
    setClarificationOptions([]);
    setCustomClarification("");
    setSelectedOptionIndex(null);
  };

  function handleProceed() {
    if (campaignId) {
      router.push(`/campaigns/${campaignId}/review`);
    }
  }

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted font-bold text-xs uppercase tracking-wider">
          <svg className="w-5 h-5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking workspace session…
        </div>
      </div>
    );
  }

  return (
    <PageWrapper
      title={prefillCustomerIds.length > 0 ? "Follow-up Campaign" : "New Campaign"}
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Campaigns", href: "/campaigns" },
        { label: "New Builder" }
      ]}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Info Block */}
        <div className="rounded-[18px] bg-surface p-5 border-none shadow-none">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-accent-light text-accent text-xs font-bold uppercase tracking-wider mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            AI-Powered Campaign Builder
          </div>
          <p className="text-text-muted text-xs font-medium leading-relaxed">
            {prefillCustomerIds.length > 0
              ? `Targeting ${prefillCustomerIds.length} customer${prefillCustomerIds.length === 1 ? "" : "s"} who clicked your previous campaign. AI will write personalised follow-up messages for them.`
              : "Describe your audience and goal in plain English. Kimi AI will extract the segment, write personalized messages, and prepare them for your review."
            }
          </p>
        </div>

        {/* Chat input */}
        <ChatInput
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          errorCode={errorCode}
          runningCampaignId={runningCampaignId}
          prefillIntent={prefillIntent}
          prefillChannel={prefillChannel}
        />

        {/* Live build dashboard */}
        {currentStep !== "idle" && (
          <LiveBuildDashboard
            currentStep={currentStep}
            statusText={statusText}
            filters={filters}
            customerCount={customerCount}
            sampleCustomers={sampleCustomers}
            messages={streamMessages}
            campaignId={campaignId}
            onProceed={handleProceed}
            onRetry={() => handleSubmit(submittedIntent, submittedChannel, submittedScheduledAt)}
            errorMsg={error}
          />
        )}
      </div>

      {/* Q&A Clarification Popup Modal */}
      {currentStep === "clarifying" && clarificationQuestion && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[18px] p-6 max-w-lg w-full mx-4 shadow-xl space-y-5 border-none text-text">
            
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border pb-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-light flex items-center justify-center shrink-0 text-amber select-none">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-text tracking-tight">Query Clarification</h3>
                <p className="text-xs text-text-muted font-bold uppercase tracking-wider">Help the AI refine your target audience</p>
              </div>
            </div>

            {/* Question */}
            <div className="bg-surface rounded-[18px] p-4">
              <p className="text-xs font-bold text-text leading-relaxed">
                {clarificationQuestion}
              </p>
            </div>

            {/* Suggested Options */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider pl-1">Suggested Options:</p>
              <div className="grid grid-cols-1 gap-2">
                {clarificationOptions.map((option, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectOption(option, idx)}
                    className={`text-left px-5 h-11 rounded-pill text-xs font-extrabold transition-all duration-150 leading-relaxed border-none shadow-none cursor-pointer ${
                      selectedOptionIndex === idx
                        ? "bg-accent text-white"
                        : "bg-surface text-text hover:bg-surface-hover"
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-extrabold mr-2 ${
                      selectedOptionIndex === idx ? "bg-white/20 text-white" : "bg-white text-text-muted"
                    }`}>
                      {idx + 1}
                    </span>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="space-y-1.5">
              <label htmlFor="custom-clarification" className="text-xs font-bold text-text-muted uppercase tracking-wider pl-1 block">
                Or Customize Your Response:
              </label>
              <textarea
                id="custom-clarification"
                value={customClarification}
                onChange={(e) => {
                  setCustomClarification(e.target.value);
                  setSelectedOptionIndex(null);
                }}
                placeholder="Modify the chosen option or enter your own custom clarification context..."
                className="global-textarea focus:ring-accent-light"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelClarification}
                className="btn-ghost flex-1 h-11"
              >
                Cancel Setup
              </button>
              <button
                type="button"
                onClick={handleClarificationSubmit}
                disabled={!customClarification.trim()}
                className={`btn-primary flex-1 h-11 ${
                  !customClarification.trim() ? "bg-surface-hover text-text-faint cursor-not-allowed scale-100 shadow-none hover:scale-100" : ""
                }`}
              >
                Refine Query
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </PageWrapper>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg text-text-muted flex items-center justify-center font-bold text-xs uppercase tracking-wider">
        Loading campaign builder...
      </div>
    }>
      <NewCampaign />
    </Suspense>
  );
}
