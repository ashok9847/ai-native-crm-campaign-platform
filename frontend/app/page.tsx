"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/api";
import Logo from "@/components/ui/Logo";

// ── Custom ScrollReveal Animation Component ───────────────────────────
function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ── Custom CountUp Animation Component ─────────────────────────────────
function CountUp({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    let start = 0;
    const duration = 1200;
    const totalSteps = 60;
    const stepTime = duration / totalSteps;
    const increment = end / totalSteps;
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.round(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [started, end]);

  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

export default function HomePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      setCheckingAuth(false);
      // Trigger hero entry animations
      const timer = setTimeout(() => setMounted(true), 50);
      return () => clearTimeout(timer);
    }
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress((window.scrollY / totalScroll) * 100);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [checkingAuth]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white text-[#0A0A0A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#09090B]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] font-medium selection:bg-[#09090B] selection:text-white overflow-x-hidden antialiased">
      {/* Scroll Progress Bar */}
      <div 
        className="fixed top-0 left-0 h-[3px] bg-[#09090B] z-50 transition-all duration-75 ease-out"
        style={{ width: `${scrollProgress}%` }}
      />
      
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 1 — NAVBAR
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="sticky top-0 z-50 w-full bg-white border-b border-[#F2F2F2]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Left: Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
            <Logo size="sm" mode="dark" />
          </Link>

          {/* Center Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-semibold text-[#888888] hover:text-[#0A0A0A] transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-semibold text-[#888888] hover:text-[#0A0A0A] transition-colors">How it works</a>
            <a href="#customers" className="text-sm font-semibold text-[#888888] hover:text-[#0A0A0A] transition-colors">Customers</a>
            <a href="#pricing" className="text-sm font-semibold text-[#888888] hover:text-[#0A0A0A] transition-colors">Pricing</a>
          </nav>

          {/* Right CTAs (Desktop) */}
          <div className="hidden md:flex items-center gap-3">
            <Link 
              href="/login?demo=true" 
              className="px-5 py-2.5 rounded-[50px] border border-[#F2F2F2] hover:bg-[#F5F5F5] text-xs font-extrabold text-[#0A0A0A] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              View Demo
            </Link>
            <Link 
              href="/register" 
              className="px-5 py-2.5 rounded-[50px] bg-[#09090B] hover:bg-[#27272A] text-xs font-extrabold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1"
            >
              Go to App →
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-[#0A0A0A] focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-[#F2F2F2] bg-white px-4 py-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-5 duration-200">
            <a 
              href="#features" 
              onClick={() => setIsMenuOpen(false)}
              className="text-base font-semibold text-[#888888] hover:text-[#0A0A0A] py-1"
            >
              Features
            </a>
            <a 
              href="#how-it-works" 
              onClick={() => setIsMenuOpen(false)}
              className="text-base font-semibold text-[#888888] hover:text-[#0A0A0A] py-1"
            >
              How it works
            </a>
            <a 
              href="#customers" 
              onClick={() => setIsMenuOpen(false)}
              className="text-base font-semibold text-[#888888] hover:text-[#0A0A0A] py-1"
            >
              Customers
            </a>
            <a 
              href="#pricing" 
              onClick={() => setIsMenuOpen(false)}
              className="text-base font-semibold text-[#888888] hover:text-[#0A0A0A] py-1"
            >
              Pricing
            </a>
            <div className="border-t border-[#F2F2F2] pt-4 flex flex-col gap-3">
              <Link 
                href="/login?demo=true"
                className="w-full text-center py-3 rounded-[50px] border border-[#F2F2F2] text-sm font-extrabold text-[#0A0A0A]"
              >
                View Demo
              </Link>
              <Link 
                href="/register"
                className="w-full text-center py-3 rounded-[50px] bg-[#09090B] text-sm font-extrabold text-white"
              >
                Go to App →
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 2 — HERO
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative z-10 max-w-[1100px] mx-auto px-4 sm:px-6 pt-[120px] pb-20 text-center">
        
        {/* Glow decoration */}
        <div className="absolute top-[80px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(9,9,11,0.08),transparent_70%)] pointer-events-none -z-10" />

        {/* Badge Pill */}
        <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[50px] border border-[#09090B] text-xs font-extrabold text-[#09090B] uppercase tracking-wider mb-6 transition-all duration-700 transform ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <span>✦</span> AI-Native Campaign CRM
        </div>

        {/* Headline H1 */}
        <h1 className={`text-4xl sm:text-[64px] font-extrabold tracking-[-2px] text-[#0A0A0A] leading-[1.05] max-w-[760px] mx-auto mb-6 transition-all duration-700 delay-100 transform ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          Reach the right shoppers. <br />In plain English.
        </h1>

        {/* Subheading */}
        <p className={`text-[#555555] text-base sm:text-[18px] max-w-[560px] mx-auto leading-[1.6] mb-8 transition-all duration-700 delay-200 transform ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          Type your campaign intent. Nudge segments your customers, writes personalized messages, executes the campaign, and tells you what worked — all in under 3 minutes.
        </p>

        {/* CTA Buttons */}
        <div className={`flex flex-col sm:flex-row gap-3 justify-center items-center mb-10 transition-all duration-700 delay-300 transform ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Link 
            href="/register" 
            className="w-full sm:w-auto px-7 py-3.5 rounded-[50px] bg-[#09090B] hover:bg-[#27272A] text-sm font-extrabold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-none cursor-pointer"
          >
            Launch Your First Campaign →
          </Link>
          <Link 
            href="/login?demo=true" 
            className="w-full sm:w-auto px-7 py-3.5 rounded-[50px] border border-[#F2F2F2] hover:bg-[#F5F5F5] text-sm font-extrabold text-[#0A0A0A] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {/* Play Icon */}
            <svg className="w-4 h-4 fill-current text-[#0A0A0A]" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch 2-min Demo
          </Link>
        </div>

        {/* Micro-stats */}
        <div className={`text-[13px] text-[#AAAAAA] mb-16 transition-all duration-700 delay-400 transform ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          102 customers managed  ·  3 campaigns run  ·  26% avg open rate
        </div>

        {/* Hero Visual Mockup */}
        <div className={`relative max-w-[900px] mx-auto transition-all duration-1000 delay-500 transform ${mounted ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-8"}`}>
          {/* Subtle blue glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(29,111,235,0.08),transparent_65%)] pointer-events-none blur-xl -z-10" />
          
          {/* Browser frame */}
          <div className="w-full bg-[#F5F5F5] rounded-[18px] p-3 sm:p-5 overflow-hidden text-left border-none shadow-none">
            {/* Top window dots */}
            <div className="flex items-center gap-1.5 mb-4 px-1">
              <div className="w-3 h-3 rounded-full bg-red-400/80" />
              <div className="w-3 h-3 rounded-full bg-amber-400/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
              <div className="ml-4 h-5 px-3 rounded bg-white text-[9px] text-[#888888] font-mono flex items-center shrink-0 border border-zinc-200/40">
                nudge.ai/dashboard
              </div>
            </div>

            {/* Dashboard Command Center Preview */}
            <div className="bg-white rounded-[12px] p-4 sm:p-6 text-zinc-900 border-none shadow-none">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-zinc-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-[#09090B] uppercase tracking-wider">BrewMate Workspace</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-300" />
                    <span className="text-[10px] text-zinc-400">admin@brewmate.com</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-[#0A0A0A] tracking-tight">Command Center</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-1.5 rounded-[50px] border border-zinc-200 text-[10px] font-bold text-zinc-600 bg-white">Analytics →</div>
                  <div className="px-3.5 py-1.5 rounded-[50px] bg-[#0A0A0A] text-[10px] font-bold text-white">All Campaigns</div>
                </div>
              </div>

              {/* Copilot input box visible */}
              <div className="rounded-[12px] border border-zinc-200/80 bg-[#F5F5F5] p-4 mb-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-[#F59E0B] font-bold text-sm">✦</span>
                  <span className="text-xs font-extrabold text-zinc-700">AI Campaign Copilot</span>
                </div>
                <div className="bg-white rounded-lg border border-zinc-200 p-3 text-xs sm:text-sm text-zinc-900 font-medium">
                  Re-engage premium tier customers who haven't ordered in 30 days with a personalized discount
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 rounded bg-zinc-200 text-[9px] font-bold text-zinc-500 uppercase tracking-wide">SMS</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-200 text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Instant</span>
                  </div>
                  <div className="px-4 py-1.5 bg-[#0A0A0A] text-white text-xs font-bold rounded-[50px] cursor-pointer">Launch →</div>
                </div>
              </div>

              {/* Mini stats preview row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#F5F5F5] p-3 rounded-xl">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Matched</p>
                  <p className="text-base font-extrabold text-[#0A0A0A] mt-1">102 users</p>
                </div>
                <div className="bg-[#F5F5F5] p-3 rounded-xl">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Avg Open</p>
                  <p className="text-base font-extrabold text-emerald-600 mt-1">26.2%</p>
                </div>
                <div className="bg-[#F5F5F5] p-3 rounded-xl">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Revenue</p>
                  <p className="text-base font-extrabold text-[#0A0A0A] mt-1">₹42,850</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 3 — LOGO BAR
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10 border-t border-[#F2F2F2] text-center">
        <ScrollReveal>
          <p className="text-xs font-bold text-[#888888] uppercase tracking-wider mb-6">
            Trusted by brands like
          </p>
          <div className="flex flex-wrap items-center justify-between gap-6 px-4 md:px-12">
            {["BrewMate", "NovaModa", "GlowLab", "UrbanRoast", "PeakFit"].map((brand) => (
              <span key={brand} className="text-lg md:text-xl font-extrabold text-[#CCCCCC] select-none hover:text-[#888888] transition-colors duration-200">
                {brand}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 4 — HOW IT WORKS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="how-it-works" className="max-w-[1100px] mx-auto px-4 sm:px-6 py-20 text-center">
        <ScrollReveal>
          <div className="inline-block px-3 py-1 rounded-[50px] bg-[#09090B]/10 text-xs font-extrabold text-[#09090B] uppercase tracking-wider mb-4">
            How it works
          </div>
          <h2 className="text-3xl sm:text-[44px] font-extrabold text-[#0A0A0A] tracking-[-1.5px] leading-tight mb-3">
            From intent to results in 3 steps
          </h2>
          <p className="text-[#888888] text-base sm:text-lg mb-12">
            No SQL. No segment builder. No drag-and-drop editor.
          </p>
        </ScrollReveal>

        {/* 3-column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1 */}
          <ScrollReveal delay={0}>
            <div className="bg-[#F5F5F5] rounded-[18px] p-7 text-left border-none shadow-none h-full flex flex-col hover:scale-[1.03] hover:shadow-[0_8px_30px_rgb(0,0,0,0.015)] hover:bg-[#EFEFEF] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default">
              {/* Icon */}
              <div className="w-11 h-11 rounded-full bg-[#09090B]/10 flex items-center justify-center mb-6">
                <svg className="w-5 h-5 text-[#09090B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-extrabold text-[#0A0A0A] mb-3">01 · Describe your campaign</h3>
              <p className="text-[#888888] text-sm leading-relaxed font-medium">
                Type in plain English: "Re-engage premium customers who haven't ordered in 30 days." That's it.
              </p>
            </div>
          </ScrollReveal>

          {/* Card 2 */}
          <ScrollReveal delay={100}>
            <div className="bg-[#F5F5F5] rounded-[18px] p-7 text-left border-none shadow-none h-full flex flex-col hover:scale-[1.03] hover:shadow-[0_8px_30px_rgb(0,0,0,0.015)] hover:bg-[#EFEFEF] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default">
              {/* Icon */}
              <div className="w-11 h-11 rounded-full bg-[#F59E0B]/10 flex items-center justify-center mb-6">
                <svg className="w-5 h-5 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-extrabold text-[#0A0A0A] mb-3">02 · AI builds segment & copy</h3>
              <p className="text-[#888888] text-sm leading-relaxed font-medium">
                Nudge finds the right customers, writes a personalized message for each one, and shows you a preview before sending.
              </p>
            </div>
          </ScrollReveal>

          {/* Card 3 */}
          <ScrollReveal delay={200}>
            <div className="bg-[#F5F5F5] rounded-[18px] p-7 text-left border-none shadow-none h-full flex flex-col hover:scale-[1.03] hover:shadow-[0_8px_30px_rgb(0,0,0,0.015)] hover:bg-[#EFEFEF] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default">
              {/* Icon */}
              <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-extrabold text-[#0A0A0A] mb-3">03 · Get results in plain English</h3>
              <p className="text-[#888888] text-sm leading-relaxed font-medium">
                Track delivery, opens, clicks, and conversions. Nudge tells you what happened and suggests the next move.
              </p>
            </div>
          </ScrollReveal>

        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 5 — FEATURE SPOTLIGHT
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="features" className="max-w-[1100px] mx-auto px-4 sm:px-6 py-20">
        
        {/* Feature A (text left, visual right) */}
        <ScrollReveal>
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16 py-12">
            {/* Text Left */}
            <div className="w-full md:w-1/2 text-left">
              <span className="inline-block px-3 py-1 rounded-[50px] bg-[#09090B]/10 text-xs font-extrabold text-[#09090B] uppercase tracking-wider mb-4">
                Segmentation
              </span>
              <h3 className="text-2xl sm:text-[32px] font-extrabold text-[#0A0A0A] tracking-[-1px] leading-tight mb-4">
                No SQL. Just describe who you want to reach.
              </h3>
              <p className="text-[#888888] text-base leading-relaxed mb-6 font-medium">
                Nudge's AI reads your intent and queries your customer database automatically — by tier, recency, purchase behavior, location, and more.
              </p>
              
              {/* Bullet points */}
              <ul className="space-y-3">
                {[
                  "Natural language to segment in seconds",
                  "Preview matching customers before sending",
                  "Edit the segment before generating messages"
                ].map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm font-semibold text-[#0A0A0A]">
                    <svg className="w-4 h-4 text-[#09090B] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual Right */}
            <div className="w-full md:w-1/2">
              <div className="bg-[#F5F5F5] rounded-[18px] p-6 text-left border-none shadow-none select-none">
                <div className="flex items-center justify-between mb-4 border-b border-zinc-200/50 pb-2">
                  <span className="text-xs font-extrabold text-zinc-800">Preview: Premium Customers</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#09090B]/10 text-xs font-bold text-[#09090B]">3 matched</span>
                </div>
                <div className="space-y-2.5">
                  {[
                    { name: "Alice Vance", email: "alice@brewmate.com", status: "Active" },
                    { name: "Bob Miller", email: "bob@brewmate.com", status: "Active" },
                    { name: "Charlie Day", email: "charlie@brewmate.com", status: "Active" }
                  ].map((cust) => (
                    <div key={cust.name} className="bg-white p-3 rounded-lg flex items-center justify-between border-none">
                      <div>
                        <p className="text-xs font-bold text-[#0A0A0A]">{cust.name}</p>
                        <p className="text-[10px] text-[#888888]">{cust.email}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-[9px] font-bold text-emerald-700">{cust.status}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-200/50 flex justify-end">
                  <div className="px-3 py-1 bg-[#09090B] text-white text-xs font-bold rounded-[50px]">Confirm Segment</div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Feature B (visual left, text right) */}
        <ScrollReveal>
          <div className="flex flex-col-reverse md:flex-row items-center gap-12 md:gap-16 py-12">
            {/* Visual Left */}
            <div className="w-full md:w-1/2">
              <div className="bg-[#F5F5F5] rounded-[18px] p-6 text-left border-none shadow-none relative h-64 overflow-hidden select-none">
                {/* 3 Stacked Message Preview Cards */}
                <div className="absolute top-4 left-4 right-4 bg-white p-3.5 rounded-lg border-none transform -rotate-2 scale-95 opacity-55">
                  <p className="text-[10px] font-bold text-[#09090B] mb-1">To: Charlie Day</p>
                  <p className="text-[11px] text-zinc-600 line-clamp-1">Hi Charlie, thanks for supporting BrewMate! As a thank you...</p>
                </div>
                <div className="absolute top-10 left-6 right-6 bg-white p-3.5 rounded-lg border-none transform rotate-1 scale-95 opacity-80">
                  <p className="text-[10px] font-bold text-[#09090B] mb-1">To: Bob Miller</p>
                  <p className="text-[11px] text-zinc-600 line-clamp-1">Hey Bob, enjoy a special 10% off your next NovaModa purchase...</p>
                </div>
                <div className="absolute top-16 left-5 right-5 bg-white p-4 rounded-lg border-none transform -rotate-1 shadow-md z-10">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] font-bold text-[#09090B]">To: Alice Vance</p>
                    <span className="text-[9px] px-1 bg-amber-50 text-amber-700 rounded font-bold uppercase tracking-wider">Generated</span>
                  </div>
                  <p className="text-[11px] text-zinc-700 font-medium">
                    "Hey Alice, we loved your last purchase of the Dark Roast Blend. Here is a weekend coupon for free delivery on your next bag: <span className="font-semibold text-zinc-900">BREWBACK10</span>"
                  </p>
                </div>
              </div>
            </div>

            {/* Text Right */}
            <div className="w-full md:w-1/2 text-left">
              <span className="inline-block px-3 py-1 rounded-[50px] bg-[#09090B]/10 text-xs font-extrabold text-[#09090B] uppercase tracking-wider mb-4">
                Personalization
              </span>
              <h3 className="text-2xl sm:text-[32px] font-extrabold text-[#0A0A0A] tracking-[-1px] leading-tight mb-4">
                Every customer gets a message written just for them.
              </h3>
              <p className="text-[#888888] text-base leading-relaxed mb-6 font-medium">
                The AI uses each customer's name, order history, tier, and preferences to write messages that feel human — not templated.
              </p>
              
              {/* Bullet points */}
              <ul className="space-y-3">
                {[
                  "Unique message per customer",
                  "Inline edit before sending",
                  "Review all messages in one screen"
                ].map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm font-semibold text-[#0A0A0A]">
                    <svg className="w-4 h-4 text-[#09090B] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollReveal>

        {/* Feature C (text left, visual right) */}
        <ScrollReveal>
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16 py-12">
            {/* Text Left */}
            <div className="w-full md:w-1/2 text-left">
              <span className="inline-block px-3 py-1 rounded-[50px] bg-[#09090B]/10 text-xs font-extrabold text-[#09090B] uppercase tracking-wider mb-4">
                Insight
              </span>
              <h3 className="text-2xl sm:text-[32px] font-extrabold text-[#0A0A0A] tracking-[-1px] leading-tight mb-4">
                The follow-up you'd forget to send — automated.
              </h3>
              <p className="text-[#888888] text-base leading-relaxed mb-6 font-medium">
                After every campaign, Nudge tells you who clicked but didn't buy. One click creates a targeted follow-up for exactly those customers.
              </p>
              
              {/* Bullet points */}
              <ul className="space-y-3">
                {[
                  "Campaign summary in 2 sentences",
                  "Clicked-but-no-purchase insight card",
                  "Follow-up campaign in one click"
                ].map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm font-semibold text-[#0A0A0A]">
                    <svg className="w-4 h-4 text-[#09090B] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual Right */}
            <div className="w-full md:w-1/2">
              <div className="bg-[#F5F5F5] rounded-[18px] p-6 text-left border-none shadow-none select-none">
                <div className="rounded-[12px] bg-white border border-[#F59E0B]/30 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-[#F59E0B]/10 text-[#F59E0B]">
                      <span className="text-xs font-bold">✦</span>
                    </div>
                    <span className="text-xs font-extrabold text-[#F59E0B] uppercase tracking-wider">Follow-up Opportunity</span>
                  </div>
                  <h4 className="text-sm font-extrabold text-[#0A0A0A] mb-1.5">Re-engage Clicked-But-No-Purchase Users</h4>
                  <p className="text-xs text-[#888888] leading-relaxed mb-4 font-medium">
                    14 customers clicked the checkout link in the "BrewBack Coupon" campaign, but didn't buy within 24 hours.
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-zinc-400">Target Segment Size: 14</span>
                    <button className="px-4 py-2 rounded-[50px] bg-[#F59E0B] hover:bg-[#D97706] text-white text-xs font-extrabold flex items-center gap-1 transition-all duration-200">
                      Run follow-up →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 6 — STATS BAND
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-[#09090B] text-white py-14">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6 text-center">
            
            {/* Stat 1 */}
            <div>
              <p className="text-3xl sm:text-[44px] font-extrabold tracking-tight leading-none mb-2">
                &lt; <CountUp end={3} /> min
              </p>
              <p className="text-xs sm:text-sm font-semibold text-white/80 leading-snug">
                Campaign <br className="hidden sm:block" /> setup time
              </p>
            </div>

            {/* Stat 2 */}
            <div>
              <p className="text-3xl sm:text-[44px] font-extrabold tracking-tight leading-none mb-2">
                <CountUp end={26} suffix="%" />
              </p>
              <p className="text-xs sm:text-sm font-semibold text-white/80 leading-snug">
                Avg open <br className="hidden sm:block" /> rate
              </p>
            </div>

            {/* Stat 3 */}
            <div>
              <p className="text-3xl sm:text-[44px] font-extrabold tracking-tight leading-none mb-2">
                <CountUp end={100} suffix="%" />
              </p>
              <p className="text-xs sm:text-sm font-semibold text-white/80 leading-snug">
                Delivery <br className="hidden sm:block" /> accuracy
              </p>
            </div>

            {/* Stat 4 */}
            <div>
              <p className="text-3xl sm:text-[44px] font-extrabold tracking-tight leading-none mb-2">
                <CountUp end={2} suffix="x" />
              </p>
              <p className="text-xs sm:text-sm font-semibold text-white/80 leading-snug">
                Revenue <br className="hidden sm:block" /> attribution
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 7 — TESTIMONIAL
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="customers" className="max-w-[1100px] mx-auto px-4 sm:px-6 py-20 text-center">
        <ScrollReveal>
          <div className="bg-[#F5F5F5] rounded-[18px] p-8 md:p-14 text-center max-w-[900px] mx-auto border-none shadow-none">
            {/* Stars */}
            <div className="flex justify-center gap-1 mb-6 text-[#F59E0B]">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="text-lg">★</span>
              ))}
            </div>
            
            {/* Large Quote Mark */}
            <span className="block text-[#09090B] text-6xl font-serif leading-none h-6 select-none">“</span>
            
            {/* Quote */}
            <p className="text-lg sm:text-[24px] font-semibold text-[#0A0A0A] italic leading-normal px-4 mb-8">
              I ran our entire re-engagement campaign during lunch. Typed what I wanted, reviewed the messages, hit launch. Eight customers who hadn't ordered in 45 days came back.
            </p>
            
            {/* Attribution */}
            <p className="text-xs sm:text-sm font-extrabold text-[#888888] uppercase tracking-wider">
              — Priya S., Head of Marketing, BrewMate
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 8 — FINAL CTA
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="pricing" className="max-w-[1100px] mx-auto px-4 sm:px-6 py-20 text-center">
        <ScrollReveal>
          <h2 className="text-4xl sm:text-[56px] font-extrabold text-[#0A0A0A] tracking-[-2px] leading-tight mb-3">
            Ready to run your first AI campaign?
          </h2>
          <p className="text-[#888888] text-base sm:text-lg mb-8 font-medium">
            No setup. No integrations. Just type and launch.
          </p>
          <div className="mb-6">
            <Link 
              href="/register" 
              className="inline-block px-10 py-4 rounded-[50px] bg-[#09090B] hover:bg-[#27272A] text-base font-extrabold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-none cursor-pointer"
            >
              Open Nudge →
            </Link>
          </div>
          <p className="text-[13px] text-[#AAAAAA]">
            Free to use · No credit card required · Takes 2 minutes
          </p>
        </ScrollReveal>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECTION 9 — FOOTER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="border-t border-[#F2F2F2] bg-white py-12">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pb-8 border-b border-[#F2F2F2]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#09090B] rounded-lg flex items-center justify-center font-bold text-white text-base select-none">
                N
              </div>
              <div>
                <span className="text-base font-extrabold text-[#0A0A0A] tracking-tight block leading-tight">Nudge</span>
                <span className="text-[11px] text-[#888888] font-semibold tracking-wide block">AI-Native Campaign CRM</span>
              </div>
            </div>
            <div className="text-xs font-semibold text-[#888888] sm:text-right">
              Built for Xeno Engineering Assignment · 2026
            </div>
          </div>
          <div className="pt-6 text-center sm:text-left">
            <p className="text-[11px] text-[#AAAAAA] font-semibold tracking-wider uppercase">
              Built with Next.js · FastAPI · Nebius AI · Supabase
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
