"use client";

/**
 * GlobalNav — persistent top navigation bar.
 * Shows: Nudge logo + links to New Campaign, Campaigns, Customers.
 * Active link highlighted. Hidden on home page and login page.
 * Includes user profile menu dropdown for multi-tenant workspace management.
 */

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated, getProfile, logout, listCampaigns, getCampaignStreamUrl } from "@/lib/api";
import type { UserProfileResponse } from "@/lib/types";
import { toast } from "sonner";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/campaigns/new", label: "New Campaign", icon: "✦" },
  { href: "/audiences", label: "Audiences" },
  { href: "/campaigns", label: "History" },
  { href: "/customers", label: "Customers" },
  { href: "/communications", label: "Communications" },
];

export default function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Active Campaign Status Monitor (Global SSE)
  const activeStreams = useRef<Map<number, EventSource>>(new Map());

  // Fetch user profile if authenticated
  useEffect(() => {
    // Skip on login, register or home pages
    if (pathname === "/" || pathname === "/login" || pathname === "/register") return;

    if (isAuthenticated()) {
      getProfile()
        .then(setProfile)
        .catch((err) => {
          console.error("Failed to load user profile:", err);
          // If we fail with 401, clear token and redirect
          logout();
          router.push("/login");
        });
    }
  }, [pathname, router]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Background active campaign tracking
  useEffect(() => {
    // Skip monitoring on home, login, register, or if not authenticated
    if (pathname === "/" || pathname === "/login" || pathname === "/register" || !isAuthenticated()) {
      activeStreams.current.forEach((es) => es.close());
      activeStreams.current.clear();
      return;
    }

    const pollActiveCampaigns = async () => {
      try {
        const res = await listCampaigns(1, 10);
        if (!res || !res.items) return;

        const executingCampaigns = res.items.filter((c) => c.state === "EXECUTING");
        const executingIds = new Set(executingCampaigns.map((c) => c.id));

        // Connect to any new executing campaigns
        executingCampaigns.forEach((c) => {
          if (!activeStreams.current.has(c.id)) {
            const streamUrl = getCampaignStreamUrl(c.id);
            const es = new EventSource(streamUrl);
            activeStreams.current.set(c.id, es);

            es.addEventListener("campaign_complete", () => {
              toast(
                <div 
                  onClick={() => router.push(`/campaigns/${c.id}/results`)} 
                  className="cursor-pointer w-full text-left"
                >
                  <div className="font-bold text-emerald-400">Campaign Complete</div>
                  <div className="text-xs text-slate-300 mt-1">
                    Campaign "{c.name}" has completed successfully. Click to view results.
                  </div>
                </div>
              );
              es.close();
              activeStreams.current.delete(c.id);
            });

            es.addEventListener("campaign_cancelled", () => {
              toast(
                <div 
                  onClick={() => router.push(`/campaigns/${c.id}/tracker`)} 
                  className="cursor-pointer w-full text-left"
                >
                  <div className="font-bold text-red-400">Campaign Stopped</div>
                  <div className="text-xs text-slate-300 mt-1">
                    Campaign "{c.name}" has been cancelled. Click to view tracker.
                  </div>
                </div>
              );
              es.close();
              activeStreams.current.delete(c.id);
            });

            es.addEventListener("campaign_stalled", () => {
              toast(
                <div 
                  onClick={() => router.push(`/campaigns/${c.id}/tracker`)} 
                  className="cursor-pointer w-full text-left"
                >
                  <div className="font-bold text-amber-400">Campaign Stalled</div>
                  <div className="text-xs text-slate-300 mt-1">
                    Campaign "{c.name}" has stalled. Click to view tracker.
                  </div>
                </div>
              );
              es.close();
              activeStreams.current.delete(c.id);
            });

            es.onerror = () => {
              // EventSource auto-reconnects on transient connection loss.
              // If it actually ended, the next poll will clean it up because
              // the campaign won't be in the EXECUTING state.
            };
          }
        });

        // Clean up streams for campaigns that are no longer EXECUTING
        activeStreams.current.forEach((es, id) => {
          if (!executingIds.has(id)) {
            es.close();
            activeStreams.current.delete(id);
          }
        });
      } catch (err) {
        console.error("Failed to poll active campaigns:", err);
      }
    };

    // Run poll immediately
    pollActiveCampaigns();

    const interval = setInterval(pollActiveCampaigns, 5000);

    return () => {
      clearInterval(interval);
      activeStreams.current.forEach((es) => es.close());
      activeStreams.current.clear();
    };
  }, [pathname, profile, router]);

  // Don't show header on the home page hero, login, or register page
  if (pathname === "/" || pathname === "/login" || pathname === "/register") return null;

  const handleSignOut = () => {
    logout();
    setProfile(null);
    setIsDropdownOpen(false);
    toast.success("Signed out successfully", {
      description: "Come back soon!",
    });
    router.push("/login");
  };

  // Get user initials (e.g. "alice@brewmate.com" -> "AL")
  const getInitials = () => {
    if (!profile?.email) return "U";
    const namePart = profile.email.split("@")[0] || "";
    if (namePart.length >= 2) {
      return namePart.substring(0, 2).toUpperCase();
    }
    return namePart.substring(0, 1).toUpperCase() || "U";
  };

  return (
    <header className="sticky top-3 z-50 w-full px-6 pointer-events-none">
      <div className="max-w-7xl mx-auto bg-zinc-100/90 backdrop-blur-md rounded-full h-14 px-6 flex items-center justify-between gap-6 pointer-events-auto">
        {/* Logo and links container */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link
            href={profile ? "/dashboard" : "/"}
            className="flex items-center gap-2 shrink-0 transition-transform duration-200 hover:scale-105 active:scale-95"
          >
            <div className="flex items-center gap-1.5">
              <svg className="w-6 h-6 text-zinc-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <span className="text-xl font-bold tracking-tight text-zinc-950">
                Nudge
              </span>
            </div>
          </Link>
 
          {/* Nav links */}
          <div className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon }) => {
              const isActive =
                href === "/campaigns/new"
                  ? pathname === href
                  : pathname.startsWith(href) && !(href === "/campaigns" && pathname === "/campaigns/new");
 
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-4.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98] ${
                    href === "/campaigns/new"
                      ? isActive
                        ? "bg-[#09090B] text-white shadow-sm"
                        : "bg-[#09090B]/10 text-[#09090B] hover:bg-[#09090B]/20"
                      : isActive
                      ? "bg-zinc-100 text-zinc-900 font-bold"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                  }`}
                >
                  {icon && <span className="text-xs">{icon}</span>}
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
 
        {/* Profile / Workspace info dropdown */}
        {profile && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 text-left cursor-pointer shadow-sm min-h-[40px]"
            >
              {/* Initials avatar */}
              <div className="w-8 h-8 rounded-full bg-[#09090B] flex items-center justify-center text-xs font-bold text-white shrink-0">
                {getInitials()}
              </div>

              {/* Workspace name label */}
              <div className="hidden sm:block ml-1 mr-1">
                <p className="text-xs font-bold text-zinc-900 leading-none">
                  {profile.tenant_name}
                </p>
              </div>

              {/* Chevron icon */}
              <svg
                className={`w-4 h-4 text-zinc-600 transition-transform duration-200 ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown panel */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
                {/* Header */}
                <div className="px-3 py-2">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    Logged in as
                  </p>
                  <p className="text-xs font-semibold text-zinc-950 truncate mt-1">
                    {profile.email}
                  </p>
                  <div className="mt-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#09090B]/10 border border-[#09090B]/20 w-fit text-xs font-mono text-[#09090B] font-semibold tracking-wider">
                    Tenant ID: {profile.tenant_id}
                  </div>
                </div>

                <div className="border-t border-zinc-100 my-2" />

                {/* Sign out button */}
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3.5 py-2.5 rounded-full text-xs font-semibold text-red-600 hover:bg-red-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign Out Workspace
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
