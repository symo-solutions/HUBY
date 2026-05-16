"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteCampaignButton({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Supprimer la campagne"
      onClick={() => {
        if (
          !confirm(
            `Supprimer « ${campaignName} » ? Action locale — n'affecte ni Meta, ni Google.`,
          )
        )
          return;
        startTransition(async () => {
          await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
          router.refresh();
        });
      }}
      className="text-muted-foreground transition hover:text-red-600 disabled:opacity-50"
      disabled={isPending}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
