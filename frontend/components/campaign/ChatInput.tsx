"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, Loader, ArrowRight } from "lucide-react";

interface ChatInputProps {
  onSubmit: (intent: string, channel: string, scheduledAt: string | null) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  errorCode?: string | null;
  runningCampaignId?: number | null;
  prefillIntent?: string;
  prefillChannel?: string;
}

export default function ChatInput({
  onSubmit,
  loading = false,
  error = null,
  errorCode = null,
  runningCampaignId = null,
  prefillIntent = "",
  prefillChannel = "sms",
}: ChatInputProps) {
  const [intent, setIntent] = useState(prefillIntent);
  const [channel, setChannel] = useState(prefillChannel);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefillIntent) {
      const timer = setTimeout(() => {
        setIntent(prefillIntent);
        setChannel(prefillChannel);
        textareaRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [prefillIntent, prefillChannel]);

  // Auto-resize textarea
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setIntent(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const trimmed = intent.trim();
    if (!trimmed || loading) return;
    onSubmit(
      trimmed,
      channel,
      isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null
    );
  }

  const charCount = intent.length;
  const maxChars = 500;
  const isOverLimit = charCount > maxChars;
  const canSubmit = intent.trim().length > 0 && !loading && !isOverLimit;

  const isConcurrentError = errorCode === "CAMPAIGN_ALREADY_EXECUTING";
  const isAIError = errorCode === "AI_UNAVAILABLE";

  return (
    <div className="space-y-4 animate-slideInUp">
      {/* Input box */}
      <div
        className={`relative rounded-[18px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-none shadow-none ${
          error ? "bg-red-light" : "bg-surface focus-within:ring-2 focus-within:ring-accent-light"
        }`}
      >
        <textarea
          ref={textareaRef}
          id="campaign-intent"
          value={intent}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Re-engage premium customers who haven't ordered in 30 days with a personalised offer..."
          rows={3}
          disabled={loading}
          className="w-full resize-none bg-transparent text-text placeholder:text-text-faint text-sm leading-relaxed !px-5 !pt-4 !pb-14 focus:outline-none disabled:opacity-50 font-medium"
          style={{ minHeight: "100px" }}
        />

        {/* Bottom bar: char count + submit */}
        <div className="absolute bottom-3 left-5 right-3 flex items-center justify-between">
          <span
            className={`text-xs font-extrabold ${
              isOverLimit ? "text-red" : "text-text-muted"
            }`}
          >
            {charCount}/{maxChars}
          </span>

          <div className="flex items-center gap-3">
            <span className="text-text-muted text-xs hidden sm:block font-extrabold uppercase tracking-wider">
              {loading ? "" : "Ctrl+Enter to send"}
            </span>
            <button
              id="chat-submit-btn"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`btn-primary h-10 px-5 shrink-0 shadow-none border-none cursor-pointer ${
                !canSubmit ? "bg-surface-hover text-text-faint cursor-not-allowed scale-100 hover:scale-100" : ""
              }`}
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin text-white" />
                  <span>Thinking…</span>
                </>
              ) : (
                <>
                  <span>Generate</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Channel & Scheduling Row ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-6 p-6 rounded-[18px] bg-surface border-none shadow-none">
        {/* Channel Selector */}
        <div className="flex-1 space-y-2.5">
          <label className="text-xs font-extrabold text-text-muted uppercase tracking-widest block">Outreach Channel</label>
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { id: "sms", label: "SMS" },
              { id: "whatsapp", label: "WhatsApp" },
              { id: "email", label: "Email" },
              { id: "rcs", label: "RCS" },
            ].map((ch) => (
              <button
                key={ch.id}
                type="button"
                disabled={loading}
                onClick={() => setChannel(ch.id)}
                className={`h-10 rounded-pill text-xs font-extrabold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer border-none shadow-none flex items-center justify-center ${
                  channel === ch.id
                    ? "bg-accent text-white"
                    : "bg-white text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50"
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule Selector */}
        <div className="flex-1 space-y-2.5">
          <label className="text-xs font-extrabold text-text-muted uppercase tracking-widest block">Schedule Option</label>
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsScheduled(false);
                setScheduledAt("");
              }}
              className={`flex-1 h-10 rounded-pill text-xs font-extrabold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer border-none shadow-none flex items-center justify-center ${
                !isScheduled
                  ? "bg-accent text-white"
                  : "bg-white text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50"
              }`}
            >
              Send Now
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setIsScheduled(true)}
              className={`flex-1 h-10 rounded-pill text-xs font-extrabold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer border-none shadow-none flex items-center justify-center ${
                isScheduled
                  ? "bg-accent text-white"
                  : "bg-white text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50"
              }`}
            >
              Schedule Later
            </button>
          </div>
          {isScheduled && (
            <input
              type="datetime-local"
              value={scheduledAt}
              disabled={loading}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              className="w-full mt-2 h-11 px-5 rounded-pill bg-white text-sm text-text border-none focus:outline-none focus:ring-2 focus:ring-accent-light disabled:opacity-50 shadow-none font-bold"
            />
          )}
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3.5 rounded-[18px] bg-red-light text-red text-xs shadow-none border-none animate-fadeIn"
        >
          <svg
            className="w-4 h-4 mt-0.5 shrink-0 text-red"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>

          <div className="flex-1 min-w-0">
            <p className="leading-snug font-bold">{error}</p>
          </div>

          {isConcurrentError ? (
            <Link
              id="view-running-campaign-btn"
              href={
                runningCampaignId
                  ? `/campaigns/${runningCampaignId}/tracker`
                  : "/campaigns"
              }
              className="shrink-0 text-xs font-bold text-red hover:underline whitespace-nowrap"
            >
              {runningCampaignId ? "View Tracker →" : "View Campaigns →"}
            </Link>
          ) : isAIError ? (
            <button
              id="chat-retry-btn"
              onClick={handleSubmit}
              disabled={!intent.trim()}
              className="shrink-0 text-xs font-bold text-red hover:underline cursor-pointer border-none bg-transparent"
            >
              Retry
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
