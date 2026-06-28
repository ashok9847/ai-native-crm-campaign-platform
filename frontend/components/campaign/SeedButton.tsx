"use client";

/**
 * SeedButton — triggers the POST /customers/seed endpoint.
 * Shows a spinner while loading; toast on success or failure.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { seedCustomers } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface SeedButtonProps {
  onSuccess?: () => void;
}

export default function SeedButton({ onSuccess }: SeedButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSeed() {
    setLoading(true);

    try {
      const result = await seedCustomers();
      if (result.seeded > 0) {
        toast.success(`${result.seeded} customers seeded successfully`);
      } else {
        toast.info(`All ${result.skipped} customers already exist`);
      }
      // Call success callback to reload client list, or fallback to refresh
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "Seed failed";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      id="seed-customers-btn"
      onClick={handleSeed}
      disabled={loading}
      variant="outline"
      className="border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-50 transition-all"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Seeding…
        </span>
      ) : (
        "Seed 42 Customers"
      )}
    </Button>
  );
}
