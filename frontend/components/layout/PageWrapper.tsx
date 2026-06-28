"use client";

import React from "react";
import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageWrapperProps {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageWrapper({
  title,
  breadcrumbs,
  actions,
  children,
}: PageWrapperProps) {
  return (
    <div className="w-full min-h-screen bg-bg">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 animate-slideInUp">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider text-text-muted uppercase">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <li key={idx} className="flex items-center gap-1.5">
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="hover:text-text transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-text-muted">{crumb.label}</span>
                    )}
                    {!isLast && <span className="text-text-faint select-none">/</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {/* Title Area */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <h1 className="text-3xl font-extrabold text-text tracking-tight">
            {title}
          </h1>
          {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
}
