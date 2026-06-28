"use client";

import { HealthGauge } from "@/components/charts/health-gauge";
import type { ChurnAlertItem } from "@/lib/types";
import { Check, AlertCircle } from "lucide-react";

interface ChurnAlertStripProps {
  alerts: ChurnAlertItem[];
  totalAtRisk: number;
  totalChurning: number;
}

export function ChurnAlertStrip({
  alerts,
  totalAtRisk,
  totalChurning,
}: ChurnAlertStripProps) {
  const totalAlerts = totalAtRisk + totalChurning;

  if (totalAlerts === 0) {
    return (
      <div className="rounded-[18px] bg-green-light p-4 border-none shadow-none">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green text-white shrink-0 select-none">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-green">
              All customers healthy
            </p>
            <p className="text-xs text-text-muted mt-0.5 font-semibold">
              No active churn alerts at this time
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-red-light p-5 border-none shadow-none">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-red text-white shrink-0 select-none">
            <AlertCircle className="w-4 h-4" />
            {/* Pulse indicator */}
            <div className="absolute inset-0 animate-ping rounded-full bg-red/20" />
          </div>
          <div>
            <p className="text-sm font-bold text-red">
              Churn Alert — {totalAlerts} customer{totalAlerts !== 1 ? "s" : ""} at risk
            </p>
            <p className="text-xs text-text-muted mt-0.5 font-semibold">
              {totalChurning} churning · {totalAtRisk} at risk
            </p>
          </div>
        </div>
      </div>

      {/* Customer cards */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {alerts.slice(0, 6).map((alert) => (
          <div
            key={alert.id}
            className="flex min-w-[220px] flex-shrink-0 items-center gap-3 rounded-[18px] bg-white p-3.5 border-none shadow-none hover:scale-[1.01] transition-transform duration-200"
          >
            <HealthGauge score={alert.health.score} size={48} strokeWidth={4} />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-text">
                {alert.name}
              </p>
              <p className="truncate text-xs text-text-muted mt-0.5 font-semibold">{alert.email}</p>
              {alert.health.recommended_action && (
                <p className="mt-1 truncate text-xs text-red font-extrabold uppercase tracking-wider">
                  {alert.health.recommended_action.split(" ").slice(0, 3).join(" ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
