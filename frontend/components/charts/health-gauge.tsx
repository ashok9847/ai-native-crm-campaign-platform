"use client";

interface HealthGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function zoneColor(score: number): { stroke: string; glow: string; text: string } {
  if (score >= 60) return { stroke: "#10b981", glow: "rgba(16,185,129,0.1)", text: "text-emerald-700 font-bold" };
  if (score >= 30) return { stroke: "#f59e0b", glow: "rgba(245,158,11,0.1)", text: "text-amber-700 font-bold" };
  return { stroke: "#ef4444", glow: "rgba(239,68,68,0.1)", text: "text-rose-700 font-bold" };
}

function zoneLabel(score: number): string {
  if (score >= 60) return "Healthy";
  if (score >= 30) return "At Risk";
  return "Churning";
}

export function HealthGauge({
  score,
  size = 120,
  strokeWidth = 10,
  label,
}: HealthGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const { stroke, text: textColor } = zoneColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#F3F4F6"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl ${textColor}`}>{score}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
            {zoneLabel(score)}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-zinc-500 font-semibold">{label}</span>
      )}
    </div>
  );
}
