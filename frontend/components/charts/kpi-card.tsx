"use client";

import { useEffect, useRef, useState } from "react";

interface KpiCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon?: React.ReactNode;
  trend?: number; // percentage change
  color?: string;
}

function useCountUp(target: number, duration = 1200) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const diff = target - start;
    if (diff === 0) return;
    const steps = Math.max(30, Math.min(60, Math.abs(diff)));
    const stepTime = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const val = Math.round(start + diff * eased);
      setCurrent(val);
      ref.current = val;
      if (step >= steps) clearInterval(timer);
    }, stepTime);

    return () => clearInterval(timer);
  }, [target, duration]);

  return current;
}

const badgeStyles: Record<string, { bg: string; text: string }> = {
  "Total Customers": { bg: "#F4F4F5", text: "#09090B" },
  "Total Campaigns": { bg: "#ECFDF5", text: "#047857" },
  "Total Orders": { bg: "#ECFDF5", text: "#047857" },
  "Total Revenue": { bg: "#EFF6FF", text: "#1D4ED8" },
  "Attributed Revenue": { bg: "#FFFBEB", text: "#B45309" },
  "Organic Revenue": { bg: "#F0FDF4", text: "#15803D" },
  "Open Rate": { bg: "#FEF2F2", text: "#B91C1C" },
  "Global Conversion Rate": { bg: "#FAF5FF", text: "#7E22CE" },
};

export function KpiCard({
  label,
  value,
  prefix = "",
  suffix = "",
  icon,
  trend,
  color = "from-zinc-500/20 to-zinc-600/20",
}: KpiCardProps) {
  const displayValue = useCountUp(value);
  const config = badgeStyles[label] || { bg: "#F4F4F5", text: "#09090B" };

  return (
    <div
      className="group relative overflow-hidden rounded-xl bg-white p-6 border border-zinc-200/80 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-zinc-300 hover:-translate-y-1.5 cursor-pointer"
    >
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
            {label}
          </p>
          <p className="mt-2 text-3.5xl font-bold tracking-tight text-zinc-900 leading-none">
            {prefix}
            {displayValue.toLocaleString()}
            {suffix}
          </p>
          {trend !== undefined && (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium">
              <span 
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                  trend >= 0 
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-100/80" 
                    : "bg-rose-50 text-rose-800 border border-rose-100/80"
                }`}
              >
                <span>{trend >= 0 ? "↑" : "↓"}</span>
                <span>{Math.abs(trend)}%</span>
              </span>
              <span className="text-zinc-600">vs last month</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg shadow-sm border border-zinc-100"
            style={{ backgroundColor: config.bg, color: config.text }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
