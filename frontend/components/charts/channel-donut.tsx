"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ChannelDonutProps {
  data: { name: string; count: number }[];
  title?: string;
}

const COLORS = ["#09090B", "#71717A", "#D4D4D8"];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-[18px] bg-white px-3 py-2 border border-border shadow-sm">
      <p className="text-xs font-semibold text-text-muted">
        <span className="font-bold text-text">{name}</span>: {value.toLocaleString()}
      </p>
    </div>
  );
};

export function ChannelDonut({ data, title = "Channel Distribution" }: ChannelDonutProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (!data?.length || total === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-[18px] bg-surface border-none shadow-none">
        <p className="text-xs text-text-muted font-bold uppercase tracking-wider">No channel data</p>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-surface p-6 border-none shadow-none">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      <div className="relative h-[220px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data.map((d) => ({ name: d.name.toUpperCase(), value: d.count }))}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} contentStyle={{ background: "transparent", border: "none", padding: 0 }} wrapperStyle={{ outline: "none" }} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-text tracking-tight">{total}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Total</p>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              {d.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
