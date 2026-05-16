"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Megaphone,
  Plug,
  ScrollText,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Tableau de bord", icon: BarChart3 },
  { href: "/campaigns", label: "Campagnes", icon: Megaphone },
  { href: "/integrations", label: "Intégrations", icon: Plug },
  { href: "/logs", label: "Journal", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-col border-r border-border bg-white px-4 py-6 md:flex">
      <Link
        href="/dashboard"
        className="mb-8 flex items-center gap-2 px-2 text-base font-semibold"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        Smart Ads
      </Link>

      <nav className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border bg-slate-50 p-3 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Synchronisation</div>
        Toutes les 6 heures. Manuellement depuis Intégrations.
      </div>
    </aside>
  );
}
