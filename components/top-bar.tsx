"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-white px-8 py-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Connecté en tant que
        </p>
        <p className="text-sm font-medium">{user.email}</p>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="btn-ghost text-muted-foreground"
      >
        <LogOut className="h-4 w-4" />
        Déconnexion
      </button>
    </header>
  );
}
