"use client";

import MessageCard from "./MessageCard";
import type { CampaignDetailResponse } from "@/lib/types";

interface MessageCardListProps {
  campaign: CampaignDetailResponse;
  tierMap?: Record<number, string>;
}

export default function MessageCardList({ campaign, tierMap = {} }: MessageCardListProps) {
  const messages = campaign.messages ?? [];

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted text-xs font-bold uppercase tracking-wider bg-surface rounded-[18px]">
        No messages generated yet.
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-[18px] p-6 space-y-4 shadow-sm animate-fadeIn">
      {/* Header Row */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Message Previews
          <span className="ml-2 text-text-faint font-bold">
            ({messages.length} total)
          </span>
        </h3>
        <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Click to edit inline</span>
      </div>

      {/* Scrollable Container */}
      <div className="max-h-[450px] overflow-y-auto pr-1 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {messages.map((msg) => (
            <MessageCard
              key={msg.id}
              campaignId={campaign.id}
              message={msg}
              tier={tierMap[msg.customer_id] ?? "starter"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
