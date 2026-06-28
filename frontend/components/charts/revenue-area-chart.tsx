"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RevenueAreaChartProps {
  data: { date: string; revenue: number }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-[18px] bg-white px-4 py-3 border border-border shadow-sm">
      <p className="mb-2 text-xs font-bold text-text">{label}</p>
      <p className="text-xs font-bold text-text-muted">
        Revenue: <span className="text-text font-extrabold ml-1">₹{Number(payload[0].value).toLocaleString()}</span>
      </p>
    </div>
  );
};

export function RevenueAreaChart({ data }: RevenueAreaChartProps) {
  if (!data?.length) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-[18px] bg-surface border-none shadow-none">
        <p className="text-xs text-text-muted font-bold uppercase tracking-wider">No revenue data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-surface p-6 border-none shadow-none">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
        Revenue Over Time
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: "bold" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: "bold" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} contentStyle={{ background: "transparent", border: "none", padding: 0 }} wrapperStyle={{ outline: "none" }} />
          <defs>
            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#09090B" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#09090B" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#09090B"
            strokeWidth={2}
            fill="url(#revenueGrad)"
            dot={false}
            activeDot={{
              r: 5,
              fill: "#09090B",
              stroke: "rgba(9,9,11,0.2)",
              strokeWidth: 4,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
