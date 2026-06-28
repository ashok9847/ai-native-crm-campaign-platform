"use client";

import React from "react";

interface InsightCardProps {
  title: string;
  description: string;
  ctaText?: string;
  onCtaClick?: () => void;
}

export default function InsightCard({
  title,
  description,
  ctaText,
  onCtaClick,
}: InsightCardProps) {
  return (
    <div className="bg-amber-light rounded-[18px] p-6 flex flex-col sm:flex-row items-start justify-between gap-5 border-none shadow-none animate-fadeIn">
      <div className="flex gap-4">
        {/* Amber square spark icon */}
        <div className="w-11 h-11 bg-amber text-white rounded-xl flex items-center justify-center text-lg font-bold shrink-0 select-none">
          ✦
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-bold text-[#A07830] tracking-tight">
            {title}
          </h4>
          <p className="text-xs text-[#B58A3D] font-medium leading-relaxed max-w-xl">
            {description}
          </p>
        </div>
      </div>

      {ctaText && (
        <button
          onClick={onCtaClick}
          className="btn-amber shrink-0 self-end sm:self-center"
        >
          {ctaText}
        </button>
      )}
    </div>
  );
}
