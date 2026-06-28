import Link from "next/link";

/**
 * T077: 404 Not Found page.
 */

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] text-zinc-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center animate-fadeIn">
        {/* 404 display */}
        <div className="mb-8">
          <div className="text-8xl font-black text-zinc-200 mb-2 select-none tabular-nums">
            404
          </div>
          <div className="w-16 h-0.5 bg-zinc-200 mx-auto" />
        </div>

        <h1 className="text-2xl font-bold text-zinc-950 mb-3">Page not found</h1>
        <p className="text-zinc-500 text-sm leading-relaxed mb-8 font-semibold">
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Check the
          URL, or head back to the dashboard.
        </p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/campaigns/new"
            className="px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 transition-colors text-white text-xs font-bold uppercase tracking-wider shadow-sm"
          >
            ✦ New Campaign
          </Link>
          <Link
            href="/campaigns"
            className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50 transition-colors text-xs font-bold uppercase tracking-wider shadow-sm"
          >
            View History
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50 transition-colors text-xs font-bold uppercase tracking-wider shadow-sm"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
