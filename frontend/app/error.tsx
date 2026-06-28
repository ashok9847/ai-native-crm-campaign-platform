"use client";

/**
 * T077: Global error boundary — catches unhandled runtime errors in any route segment.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();

  useEffect(() => {
    console.error("[Nudge Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-zinc-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center animate-fadeIn">
        {/* Animated error icon */}
        <div className="relative mx-auto mb-8 w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-red-150 animate-ping" />
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-red-50 border border-red-200">
            <svg
              className="w-9 h-9 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-zinc-950 mb-2">Something went wrong</h1>
        <p className="text-zinc-550 text-sm leading-relaxed mb-2 font-semibold">
          {error.message || "An unexpected error occurred. Please try reloading the page."}
        </p>
        {error.digest && (
          <p className="text-zinc-400 text-xs mb-6 font-mono font-medium">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 transition-colors text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
          >
            Try again
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50 transition-colors text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
