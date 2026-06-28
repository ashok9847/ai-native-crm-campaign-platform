"use client";

import React from "react";
import { Card } from "./card";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string | number;
    isPositive?: boolean;
    isNegative?: boolean;
  };
  icon?: React.ReactNode;
  iconBg?: string; // Optional class for custom icon background
  interactive?: boolean;
  onClick?: () => void;
}

export default function StatCard({
  label,
  value,
  delta,
  icon,
  iconBg = "bg-accent-light text-accent",
  interactive = false,
  onClick,
}: StatCardProps) {
  return (
    <Card 
      interactive={interactive} 
      onClick={onClick}
      className="flex flex-row items-center justify-between p-6 h-full"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
          {label}
        </span>
        <span className="text-3xl font-extrabold text-text tracking-tight">
          {value}
        </span>
        {delta && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`text-xs font-extrabold px-3 py-1 rounded-pill ${
                delta.isPositive
                  ? "bg-green-light text-[#166534]"
                  : delta.isNegative
                  ? "bg-red-light text-[#991B1B]"
                  : "bg-surface-hover text-text-muted"
              }`}
            >
              {delta.value}
            </span>
          </div>
        )}
      </div>

      {icon && (
        <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${iconBg}`}>
          {icon}
        </div>
      )}
    </Card>
  );
}
