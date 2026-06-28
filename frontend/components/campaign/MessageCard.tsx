"use client";

import { useRef, useState } from "react";
import { patchMessage } from "@/lib/api";
import type { MessagePreview } from "@/lib/types";
import { Pencil, Loader, AlertTriangle } from "lucide-react";

const TIER_BADGES: Record<string, string> = {
  starter: "badge-pending",
  premium: "badge-amber",
  elite: "bg-text text-white px-3 py-1 rounded-pill text-xs font-bold border-none uppercase tracking-wider",
};

interface MessageCardProps {
  campaignId: number;
  message: MessagePreview;
  tier?: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function MessageCard({ campaignId, message, tier = "starter" }: MessageCardProps) {
  const [body, setBody] = useState(message.effective_body);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [initialBody, setInitialBody] = useState(message.effective_body);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
    if (saveState !== "idle") setSaveState("idle");
  }

  async function handleBlur() {
    const trimmed = body.trim();
    if (trimmed === initialBody || !trimmed) return;

    setSaveState("saving");
    setErrorMsg(null);
    try {
      await patchMessage(campaignId, message.id, trimmed);
      setInitialBody(trimmed);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err: unknown) {
      setSaveState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
    }
  }

  const isDirty = body.trim() !== initialBody;

  return (
    <div
      className={`group rounded-[18px] p-5 relative transition-all duration-300 ease-out border-none shadow-none flex flex-col gap-3.5 animate-slideInUp ${
        saveState === "error"
          ? "bg-red-light ring-2 ring-red"
          : isDirty
          ? "bg-[#F7F9FF] ring-2 ring-accent-light"
          : "bg-surface hover:bg-surface-hover hover:scale-[1.01] hover:shadow-[0_8px_30px_rgb(0,0,0,0.01)]"
      }`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white shrink-0">
            {message.customer_name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-text truncate">{message.customer_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Tier badge */}
          <span className={TIER_BADGES[tier] || "badge-pending"}>
            {tier}
          </span>

          {/* Save indicator */}
          {saveState === "saving" && (
            <Loader className="w-3.5 h-3.5 animate-spin text-accent" />
          )}
          {saveState === "saved" && (
            <span className="text-green text-xs font-bold flex items-center gap-0.5 uppercase tracking-wider">
              ✓ Saved
            </span>
          )}
          {message.edited && saveState === "idle" && (
            <span className="text-text-faint text-xs font-bold uppercase tracking-wider">edited</span>
          )}
        </div>
      </div>

      {/* Editable body */}
      <div className="flex-1 min-h-[80px]">
        <textarea
          ref={textareaRef}
          id={`message-${message.id}`}
          value={body}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full h-full resize-none bg-transparent text-text text-sm leading-relaxed font-medium focus:outline-none placeholder:text-text-faint"
          style={{ minHeight: "80px" }}
        />
      </div>

      {/* Hover pencil icon */}
      <div className="absolute right-4.5 bottom-4 opacity-0 group-hover:opacity-45 transition-opacity pointer-events-none text-text-muted">
        <Pencil className="w-4 h-4" />
      </div>

      {/* Error inline */}
      {saveState === "error" && errorMsg && (
        <div className="text-xs text-red flex items-center gap-1 font-bold uppercase tracking-wider mt-1 border-t border-red/10 pt-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMsg}
        </div>
      )}
    </div>
  );
}
