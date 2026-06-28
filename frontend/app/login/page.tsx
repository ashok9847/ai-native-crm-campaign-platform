"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, isAuthenticated } from "@/lib/api";
import { toast } from "sonner";
import Logo from "@/components/ui/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      router.push("/");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await login(email, password);
      toast.success("Welcome back!", {
        description: "You have successfully logged in.",
      });
      router.push("/");
    } catch (err: any) {
      console.error("Login error:", err);
      setErrorMessage(err.message || "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#FAFAFA] text-zinc-900 flex flex-col justify-center items-center px-4 overflow-hidden">
      <div className="relative z-10 w-full max-w-md">
        {/* Logo mark */}
        <div className="flex flex-col items-center gap-4 mb-8 text-center animate-scaleUp">
          <Link href="/" className="flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
            <Logo size="lg" mode="dark" />
          </Link>
          <p className="text-zinc-500 text-sm font-semibold">
            AI-Native CRM & Campaign Copilot
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-zinc-200 rounded-xl p-8 shadow-sm relative overflow-hidden">
          <h2 className="text-lg font-bold text-zinc-900 mb-6">
            Sign In to your workspace
          </h2>

          {errorMessage && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 text-zinc-900 placeholder-zinc-400 text-sm outline-none transition-all duration-150 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 text-zinc-900 placeholder-zinc-400 text-sm outline-none transition-all duration-150 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-sm shadow-sm transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In Workspace</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-500 font-semibold">
            Need a new workspace?{" "}
            <Link href="/register" className="text-zinc-950 hover:text-zinc-800 font-bold transition-colors">
              Sign Up
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors font-bold">
            ← Back to Home Page
          </Link>
        </div>
      </div>
    </div>
  );
}
