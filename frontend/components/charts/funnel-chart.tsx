"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { FunnelStage } from "@/lib/types";

interface FunnelChartProps {
  data: FunnelStage[];
}

const FUNNEL_COLORS = ["#09090B", "#27272A", "#52525B", "#71717A", "#A1A1AA"];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-[18px] bg-white px-4 py-3 border border-border shadow-sm">
      <p className="mb-2 text-xs font-bold text-text">{d.name}</p>
      <p className="text-xs font-bold text-text-muted">
        Value: <span className="text-text font-extrabold ml-1">{d.value.toLocaleString()}</span>
      </p>
    </div>
  );
};

export function FunnelChart({ data }: FunnelChartProps) {
  if (!data?.length || data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-[18px] bg-surface border-none shadow-none">
        <p className="text-xs text-text-muted font-bold uppercase tracking-wider">No funnel data yet</p>
      </div>
    );
  }

  // Compute drop-off percentages
  const enriched = data.map((stage, i) => ({
    ...stage,
    dropOff: i > 0 && data[i - 1].value > 0
      ? Math.round(((data[i - 1].value - stage.value) / data[i - 1].value) * 100)
      : 0,
  }));

  return (
    <div className="rounded-[18px] bg-surface p-6 border-none shadow-none">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
        Conversion Funnel
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={enriched} layout="vertical" barCategoryGap="30%">
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: "bold" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: "bold" }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} contentStyle={{ background: "transparent", border: "none", padding: 0 }} wrapperStyle={{ outline: "none" }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {enriched.map((_, i) => (
              <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Drop-off labels */}
      <div className="mt-2 flex flex-wrap justify-center gap-4">
        {enriched.slice(1).map((stage) => (
          <span key={stage.name} className="text-[10px] text-text-muted font-bold">
            {stage.name}: -{stage.dropOff}% drop-off
          </span>
        ))}
      </div>
    </div>
  );
}
