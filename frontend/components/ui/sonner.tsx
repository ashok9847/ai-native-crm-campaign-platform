"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  const { theme = "light" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-zinc-950 group-[.toaster]:border-zinc-200 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-[16px] group-[.toaster]:p-4 group-[.toaster]:border-2",
          success:
            "group-[.toast]:!bg-[#E8FFF4] group-[.toast]:!text-[#166534] group-[.toast]:!border-[#10B981] group-[.toast]:shadow-[0_8px_30px_rgba(16,185,129,0.12)]",
          error:
            "group-[.toast]:!bg-[#FFF0F0] group-[.toast]:!text-[#991B1B] group-[.toast]:!border-[#EF4444] group-[.toast]:shadow-[0_8px_30px_rgba(239,68,68,0.12)]",
          info:
            "group-[.toast]:!bg-[#F4F4F5] group-[.toast]:!text-[#0A0A0A] group-[.toast]:!border-[#E5E5E5] group-[.toast]:shadow-[0_8px_30px_rgba(0,0,0,0.06)]",
          description: "group-[.toast]:text-current opacity-80 text-xs mt-1",
          actionButton:
            "group-[.toast]:bg-zinc-900 group-[.toast]:text-white font-semibold text-xs rounded-full px-3 py-1",
          cancelButton:
            "group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-500 text-xs rounded-full px-3 py-1",
        },
      }}
      {...props}
    />
  );
}


