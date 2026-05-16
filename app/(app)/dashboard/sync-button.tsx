"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        accountsSynced?: number;
        campaignsUpserted?: number;
        rulesActions?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Échec de la synchronisation.");
      } else {
        setMessage(
          `${data.accountsSynced ?? 0} compte(s) synchronisé(s), ${data.campaignsUpserted ?? 0} campagne(s), ${data.rulesActions ?? 0} action(s).`,
        );
        router.refresh();
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={onClick} className="btn-primary" disabled={loading}>
        <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {loading ? "Synchronisation..." : "Synchroniser"}
      </button>
      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
