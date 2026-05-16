import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { NewCampaignForm } from "./new-campaign-form";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const user = await requireUser();

  const accounts = await prisma.adAccount.findMany({
    where: { userId: user.id },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      name: true,
      platform: true,
      currency: true,
    },
  });

  if (accounts.length === 0) {
    redirect("/integrations?error=no_account_connect_one_first");
  }

  return (
    <div>
      <Link
        href="/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour aux campagnes
      </Link>
      <PageHeader
        title="Nouvelle campagne"
        description="Ajoutez manuellement une campagne pour tester ou faire une démo. Les vraies campagnes sont importées automatiquement par la synchronisation."
      />
      <div className="card max-w-3xl p-6">
        <NewCampaignForm accounts={accounts} />
      </div>
    </div>
  );
}
