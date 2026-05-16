"use client";

import Link from "next/link";
import { Platform } from "@/lib/enums";
import { cn } from "@/lib/utils";

const options: { label: string; value: Platform | null }[] = [
  { label: "Toutes", value: null },
  { label: "Meta", value: Platform.META },
  { label: "Google", value: Platform.GOOGLE },
];

export function PlatformFilter({ current }: { current: Platform | null }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
      {options.map((opt) => {
        const active = current === opt.value;
        const href = opt.value
          ? `/campaigns?platform=${opt.value}`
          : "/campaigns";
        return (
          <Link
            key={opt.label}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
