"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DisconnectButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (
          !confirm(
            "Déconnecter ce compte publicitaire ? Les campagnes associées seront supprimées.",
          )
        )
          return;
        startTransition(async () => {
          await fetch(`/api/integrations/accounts/${accountId}`, {
            method: "DELETE",
          });
          router.refresh();
        });
      }}
      className="btn-outline text-red-600"
      disabled={isPending}
    >
      <Trash2 className="h-4 w-4" />
      {isPending ? "Déconnexion..." : "Déconnecter"}
    </button>
  );
}
