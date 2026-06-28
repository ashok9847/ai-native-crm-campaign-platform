"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { CampaignReachItem } from "@/lib/types";

interface CampaignReachChartProps {
  data: CampaignReachItem[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-[18px] bg-white px-4 py-3 border border-border shadow-sm">
      <p className="mb-2 text-xs font-bold text-text">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <p key={entry.dataKey} className="text-xs font-medium text-text-muted flex items-center">
            <span
              className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}: <span className="text-text font-bold ml-1">{entry.value.toLocaleString()}</span>
          </p>
        ))}
      </div>
    </div>
  );
};

export function CampaignReachChart({ data }: CampaignReachChartProps) {
  if (!data?.length) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-[18px] bg-surface border-none shadow-none">
        <p className="text-xs text-text-muted font-bold uppercase tracking-wider">No campaign data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-surface p-6 border-none shadow-none">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
        Campaign Reach
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: "bold" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: "bold" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} contentStyle={{ background: "transparent", border: "none", padding: 0 }} wrapperStyle={{ outline: "none" }} />
          <Legend
            wrapperStyle={{ fontSize: 12, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
          />
          <Bar dataKey="sent" name="Sent" fill="#09090B" radius={[4, 4, 0, 0]} />
          <Bar dataKey="delivered" name="Delivered" fill="#71717A" radius={[4, 4, 0, 0]} />
          <Bar dataKey="converted" name="Converted" fill="#D4D4D8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
