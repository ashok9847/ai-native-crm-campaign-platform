"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated, getProfile, logout, listCampaigns, getCampaignStreamUrl } from "@/lib/api";
import type { UserProfileResponse } from "@/lib/types";
import { toast } from "sonner";
import Logo from "@/components/ui/Logo";

const NAV_LINKS: Array<{ href: string; label: string; showSpark?: boolean }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/audiences", label: "Audiences" },
  { href: "/campaigns", label: "History" },
  { href: "/customers", label: "Customers" },
  { href: "/communications", label: "Communications" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const activeStreams = useRef<Map<number, EventSource>>(new Map());

  // Fetch user profile if authenticated
  useEffect(() => {
    if (pathname === "/" || pathname === "/login" || pathname === "/register") return;

    if (isAuthenticated()) {
      getProfile()
        .then(setProfile)
        .catch((err) => {
          console.error("Failed to load user profile:", err);
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

  // Background active campaign tracking logic
  useEffect(() => {
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
                  <div className="font-bold text-[#166534]">Campaign Complete</div>
                  <div className="text-xs text-[#5E5E5E] mt-1">
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
                  <div className="font-bold text-[#991B1B]">Campaign Stopped</div>
                  <div className="text-xs text-[#5E5E5E] mt-1">
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
                  <div className="font-bold text-[#92400E]">Campaign Stalled</div>
                  <div className="text-xs text-[#5E5E5E] mt-1">
                    Campaign "{c.name}" has stalled. Click to view tracker.
                  </div>
                </div>
              );
              es.close();
              activeStreams.current.delete(c.id);
            });

            es.onerror = () => {
              // auto-reconnects
            };
          }
        });

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

    pollActiveCampaigns();
    const interval = setInterval(pollActiveCampaigns, 5000);

    return () => {
      clearInterval(interval);
      activeStreams.current.forEach((es) => es.close());
      activeStreams.current.clear();
    };
  }, [pathname, profile, router]);

  if (pathname === "/" || pathname === "/login" || pathname === "/register") return null;

  const handleSignOut = () => {
    logout();
    setProfile(null);
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const getInitials = () => {
    if (!profile?.email) return "U";
    const namePart = profile.email.split("@")[0] || "";
    if (namePart.length >= 2) {
      return namePart.substring(0, 2).toUpperCase();
    }
    return namePart.substring(0, 1).toUpperCase() || "U";
  };

  const isLinkActive = (href: string) => {
    if (href === "/campaigns/new") {
      return pathname === "/campaigns/new";
    }
    if (href === "/campaigns") {
      return pathname === "/campaigns" || (pathname.startsWith("/campaigns/") && pathname !== "/campaigns/new");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-border">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* Left: Brand Logo & Links */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 group transition-all duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-accent-light rounded-lg">
            <Logo size="sm" mode="dark" />
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-4">
            {NAV_LINKS.map((link) => {
              const isActive = isLinkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 h-9 rounded-pill text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-accent-light ${
                    isActive
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {link.showSpark && (
                    <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                      <path d="M12 2l2.4 7.2L22 11.6l-7.6 2.4L12 22l-2.4-7.6L2 11.6l7.6-2.4L12 2z" />
                    </svg>
                  )}
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Side: Profile dropdown */}
        {profile && (
          <div className="hidden md:block relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 h-10 rounded-pill border border-border bg-white hover:bg-surface-hover hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-none focus-visible:ring-2 focus-visible:ring-accent-light"
            >
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white shrink-0">
                {getInitials()}
              </div>
              <span className="text-xs font-bold text-text">
                {profile.tenant_name}
              </span>
              <svg className={`w-3.5 h-3.5 text-text-muted transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-[18px] bg-white p-3 border border-border shadow-lg z-50 animate-scaleUp">
                <div className="px-3 py-2">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Logged in as</p>
                  <p className="text-xs font-bold text-text truncate mt-0.5">{profile.email}</p>
                  <div className="mt-2.5 px-2.5 py-1 rounded-pill bg-surface text-[10px] font-mono text-text-muted font-bold tracking-wider w-fit">
                    Tenant ID: {profile.tenant_id}
                  </div>
                </div>
                <div className="border-t border-border my-2" />
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3.5 py-2.5 rounded-pill text-xs font-bold text-red hover:bg-red-light transition-all flex items-center gap-2 cursor-pointer border-none"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out Workspace
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mobile menu button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 text-text focus:outline-none"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-white px-4 py-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-5 duration-200 z-50">
          <nav className="flex flex-col gap-2.5">
            {NAV_LINKS.map((link) => {
              const isActive = isLinkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-pill text-sm font-bold flex items-center gap-1.5 ${
                    isActive
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text hover:bg-surface"
                  }`}
                >
                  {link.showSpark && (
                    <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                      <path d="M12 2l2.4 7.2L22 11.6l-7.6 2.4L12 22l-2.4-7.6L2 11.6l7.6-2.4L12 2z" />
                    </svg>
                  )}
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {profile && (
            <div className="border-t border-border pt-4 flex flex-col gap-3">
              <div className="px-4 py-2">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Workspace</p>
                <p className="text-sm font-bold text-text mt-0.5">{profile.tenant_name}</p>
                <p className="text-xs text-text-muted">{profile.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full text-center py-3 rounded-pill bg-red-light text-sm font-extrabold text-red hover:bg-red/10 transition-all cursor-pointer border-none"
              >
                Sign Out Workspace
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
