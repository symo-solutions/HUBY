import { Platform } from "@/lib/enums";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge, StatusBadge } from "@/components/platform-badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PlatformFilter } from "./platform-filter";
import { DeleteCampaignButton } from "./delete-button";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { platform?: string };
}) {
  const user = await requireUser();
  const platformFilter = parsePlatform(searchParams.platform);

  const campaigns = await prisma.campaign.findMany({
    where: {
      adAccount: {
        userId: user.id,
        ...(platformFilter ? { platform: platformFilter } : {}),
      },
    },
    include: { adAccount: true },
    orderBy: [{ spend: "desc" }],
  });

  return (
    <div>
      <PageHeader
        title="Campagnes"
        description="Toutes les campagnes de vos comptes publicitaires connectés. Demandez à l'assistant IA en bas à droite pour en créer ou en modifier."
        actions={<PlatformFilter current={platformFilter} />}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Campagne</th>
              <th className="px-5 py-3">Plateforme</th>
              <th className="px-5 py-3">Statut</th>
              <th className="px-5 py-3 text-right">Dépense</th>
              <th className="px-5 py-3 text-right">Impressions</th>
              <th className="px-5 py-3 text-right">Clics</th>
              <th className="px-5 py-3 text-right">CTR</th>
              <th className="px-5 py-3 text-right">Conv.</th>
              <th className="px-5 py-3 text-right">ROAS</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-5 py-3">
                  <div className="font-medium">{c.name}</div>
                  {c.flagged && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      {c.flagReason}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <PlatformBadge platform={c.adAccount.platform} />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3 text-right">
                  {formatCurrency(c.spend, c.adAccount.currency ?? "EUR")}
                </td>
                <td className="px-5 py-3 text-right">
                  {formatNumber(c.impressions)}
                </td>
                <td className="px-5 py-3 text-right">
                  {formatNumber(c.clicks)}
                </td>
                <td className="px-5 py-3 text-right">
                  {c.ctr ? `${c.ctr.toFixed(2)}%` : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  {formatNumber(c.conversions)}
                </td>
                <td className="px-5 py-3 text-right font-medium">
                  {c.roas?.toFixed(2) ?? "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  <DeleteCampaignButton
                    campaignId={c.id}
                    campaignName={c.name}
                  />
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  Aucune campagne. Demandez à l&apos;assistant IA (en bas à
                  droite) d&apos;en créer une, ou connectez un compte
                  publicitaire et lancez une synchronisation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parsePlatform(p?: string): Platform | null {
  if (p === "META") return Platform.META;
  if (p === "GOOGLE") return Platform.GOOGLE;
  return null;
}
