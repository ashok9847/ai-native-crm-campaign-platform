"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ShoppingBag, MousePointerClick } from "lucide-react";
import type { CustomerSummary } from "@/lib/types";

interface CampaignMetrics {
  total_recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  purchased: number;
  open_rate: number;
  click_rate: number;
  conversion_rate?: number;
  attributed_revenue?: number;
}

interface ResultsPanelProps {
  aiSummary: string;
  metrics: CampaignMetrics;
  clickedCustomers?: CustomerSummary[];
  purchasedCustomers?: CustomerSummary[];
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color: "violet" | "emerald" | "blue" | "amber" | "rose";
}

const COLOR_TEXT: Record<MetricCardProps["color"], string> = {
  violet: "text-text",
  emerald: "text-[#166534]",
  blue: "text-[#1558C0]",
  amber: "text-[#92400E]",
  rose: "text-[#991B1B]",
};

function MetricCard({ label, value, sub, color }: MetricCardProps) {
  const textColorClass = COLOR_TEXT[color] || "text-text";
  return (
    <div
      className="rounded-[18px] bg-surface p-5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:bg-surface-hover border-none shadow-none"
    >
      <div className={`text-2xl font-extrabold ${textColorClass} mb-1.5 tabular-nums`}>{value}</div>
      <div className="text-text-muted text-xs font-bold uppercase tracking-wider">{label}</div>
      {sub && <div className="text-text-faint text-xs font-bold uppercase tracking-wider mt-1">{sub}</div>}
    </div>
  );
}

function CollapsibleCustomerList({
  title,
  customers,
  icon: Icon,
  badgeColor,
}: {
  title: string;
  customers: CustomerSummary[];
  icon: any;
  badgeColor: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-[18px] bg-surface border border-border/50 p-4 transition-all duration-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${badgeColor}`}>
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-text group-hover:text-accent transition-colors">
              {title}
            </div>
            <div className="text-text-muted text-xs font-semibold mt-0.5">
              {customers.length} {customers.length === 1 ? "customer" : "customers"}
            </div>
          </div>
        </div>
        <div>
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-text-muted" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-muted" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-4 pt-3 border-t border-border/30 max-h-[220px] overflow-y-auto pr-1 space-y-2 animate-fadeIn">
          {customers.length === 0 ? (
            <p className="text-xs text-text-faint font-semibold italic text-center py-2">
              No customer events recorded for this category.
            </p>
          ) : (
            customers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-bg/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-bg border border-border/40 text-text font-bold text-xs flex items-center justify-center">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-text">{c.name}</span>
                    <span className="text-[10px] text-text-muted font-medium">{c.email}</span>
                  </div>
                </div>
                <div className="text-[10px] text-text-faint font-bold tracking-wider uppercase">
                  ID: #{c.id}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultsPanel({
  aiSummary,
  metrics,
  clickedCustomers,
  purchasedCustomers,
}: ResultsPanelProps) {
  const openPct = `${Math.round(metrics.open_rate * 100)}%`;
  const clickPct = `${Math.round(metrics.click_rate * 100)}%`;
  const conversionPct = `${Math.round((metrics.conversion_rate || 0) * 100)}%`;
  const revenueStr = `₹${(metrics.attributed_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* AI summary */}
      <div className="rounded-[18px] bg-accent-light p-6 relative border-none shadow-none">
        <p className="text-accent-dark text-xs font-semibold leading-relaxed pl-1 italic">
          &ldquo;{aiSummary}&rdquo;
        </p>
        <div className="mt-3.5 flex items-center gap-1.5 pl-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-accent text-xs font-bold uppercase tracking-wider">AI Copilot Analysis</span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <MetricCard
          label="Recipients"
          value={metrics.total_recipients}
          color="violet"
        />
        <MetricCard
          label="Delivered"
          value={metrics.delivered}
          sub={`of ${metrics.sent} sent`}
          color="emerald"
        />
        <MetricCard
          label="Open Rate"
          value={openPct}
          sub={`${metrics.opened} opened`}
          color="blue"
        />
        <MetricCard
          label="Click Rate"
          value={clickPct}
          sub={`${metrics.clicked} clicked`}
          color="amber"
        />
        <MetricCard
          label="Conversion Rate"
          value={conversionPct}
          sub={`${metrics.purchased || 0} purchased`}
          color="rose"
        />
        <MetricCard
          label="Attributed Revenue"
          value={revenueStr}
          sub="from clicked orders"
          color="emerald"
        />
      </div>

      {/* Collapsible Customer Lists (Minimized Details) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CollapsibleCustomerList
          title="Purchased Customers"
          customers={purchasedCustomers || []}
          icon={ShoppingBag}
          badgeColor="bg-rose-light text-rose"
        />
        <CollapsibleCustomerList
          title="Clicked Customers"
          customers={clickedCustomers || []}
          icon={MousePointerClick}
          badgeColor="bg-amber-light text-amber"
        />
      </div>
    </div>
  );
}
