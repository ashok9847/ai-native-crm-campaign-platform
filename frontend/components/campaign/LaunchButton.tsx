"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { launchCampaign } from "@/lib/api";
import { Rocket, Loader } from "lucide-react";

interface LaunchButtonProps {
  campaignId: number;
  recipientCount: number;
  isConcurrentRunning: boolean;
  onLaunched: () => void;
}

export default function LaunchButton({
  campaignId,
  recipientCount,
  isConcurrentRunning,
  onLaunched,
}: LaunchButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleConfirm() {
    setLaunching(true);
    setError(null);
    try {
      await launchCampaign(campaignId);
      setShowDialog(false);
      onLaunched();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch campaign.";
      setError(msg);
      setLaunching(false);
    }
  }

  return (
    <>
      {/* Launch trigger button */}
      <div className="relative group shrink-0">
        <button
          id="launch-campaign-btn"
          onClick={() => !isConcurrentRunning && setShowDialog(true)}
          disabled={isConcurrentRunning || launching}
          className={`btn-primary px-6 h-11 shadow-none border-none cursor-pointer ${
            isConcurrentRunning
              ? "bg-surface-hover text-text-faint cursor-not-allowed scale-100 hover:scale-100"
              : ""
          }`}
        >
          {launching ? (
            <>
              <Loader className="w-4 h-4 animate-spin text-white" />
              Launching…
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              Launch Campaign
            </>
          )}
        </button>

        {/* Tooltip for concurrent block */}
        {isConcurrentRunning && (
          <div className="absolute bottom-full right-0 mb-2.5 px-4 py-2 rounded-pill bg-[#0A0A0A] text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-none border-none z-50">
            A campaign is already running
          </div>
        )}
      </div>

      {showDialog && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[18px] p-6 max-w-md w-full mx-4 shadow-xl space-y-4 border-none text-text">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
                <Rocket className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-sm font-extrabold text-text tracking-tight">Launch Campaign?</h3>
            </div>

            <p className="text-text-muted text-xs font-medium leading-relaxed">
              You are about to send personalized messages to{" "}
              <strong className="text-text font-bold">{recipientCount} customers</strong>.
            </p>
            <p className="text-text-faint text-xs font-bold uppercase tracking-wider">
              This action cannot be undone. Messages will be dispatched immediately.
            </p>

            {error && (
              <div className="px-3.5 py-2 rounded-pill bg-red-light text-red text-xs font-bold uppercase tracking-wider">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                id="launch-cancel-btn"
                onClick={() => { setShowDialog(false); setError(null); }}
                disabled={launching}
                className="btn-ghost flex-1 h-11"
              >
                Cancel
              </button>
              <button
                id="launch-confirm-btn"
                onClick={handleConfirm}
                disabled={launching}
                className="btn-primary flex-1 h-11"
              >
                {launching ? "Launching…" : "Yes, Send Now"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
