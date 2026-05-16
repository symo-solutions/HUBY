import {
  Activity,
  DollarSign,
  Eye,
  MousePointerClick,
  TrendingUp,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { PlatformBadge, StatusBadge } from "@/components/platform-badge";
import { formatCurrency, formatNumber, relativeTime } from "@/lib/utils";
import { SyncButton } from "./sync-button";
import { Platform } from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [campaigns, recentLogs, accounts] = await Promise.all([
    prisma.campaign.findMany({
      where: { adAccount: { userId: user.id } },
      include: { adAccount: true },
      orderBy: { spend: "desc" },
    }),
    prisma.automationLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { campaign: true },
    }),
    prisma.adAccount.findMany({ where: { userId: user.id } }),
  ]);

  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
      revenue: acc.revenue + c.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
  );
  const overallRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const overallCtr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={`Bonjour ${user.name ?? user.email.split("@")[0]} 👋`}
        description="Voici un aperçu de vos performances publicitaires sur Meta et Google."
        actions={<SyncButton />}
      />

      {accounts.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Dépense (30j)"
              value={formatCurrency(totals.spend)}
              icon={DollarSign}
            />
            <KpiCard
              label="Impressions"
              value={formatNumber(totals.impressions)}
              icon={Eye}
            />
            <KpiCard
              label="Clics"
              value={formatNumber(totals.clicks)}
              icon={MousePointerClick}
              hint={`CTR ${overallCtr.toFixed(2)}%`}
            />
            <KpiCard
              label="Conversions"
              value={formatNumber(totals.conversions)}
              icon={Activity}
            />
            <KpiCard
              label="ROAS"
              value={overallRoas.toFixed(2)}
              icon={TrendingUp}
              tone={
                overallRoas >= 2
                  ? "positive"
                  : overallRoas >= 1
                    ? "default"
                    : "negative"
              }
              hint={`Revenu ${formatCurrency(totals.revenue)}`}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-semibold">Meilleures campagnes</h2>
                <span className="text-xs text-muted-foreground">
                  Triées par dépense (30j)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2">Campagne</th>
                    <th className="px-5 py-2">Plateforme</th>
                    <th className="px-5 py-2">Statut</th>
                    <th className="px-5 py-2 text-right">Dépense</th>
                    <th className="px-5 py-2 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 8).map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-5 py-3 font-medium">{c.name}</td>
                      <td className="px-5 py-3">
                        <PlatformBadge platform={c.adAccount.platform} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {formatCurrency(c.spend, c.adAccount.currency ?? "EUR")}
                      </td>
                      <td className="px-5 py-3 text-right font-medium">
                        {c.roas?.toFixed(2) ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {campaigns.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-8 text-center text-sm text-muted-foreground"
                      >
                        Aucune campagne. Lancez une synchronisation pour les importer.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-semibold">Activité récente</h2>
                <span className="text-xs text-muted-foreground">Automatisations</span>
              </div>
              <ul className="divide-y divide-border">
                {recentLogs.length === 0 && (
                  <li className="px-5 py-6 text-sm text-muted-foreground">
                    Aucune action automatique pour l&apos;instant. Activez vos règles depuis Intégrations.
                  </li>
                )}
                {recentLogs.map((log) => (
                  <li key={log.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{log.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {relativeTime(log.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {accounts.map((a) => (
              <div key={a.id} className="card flex items-center justify-between p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={a.platform} />
                    <p className="font-medium">{a.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.platform === Platform.META ? "Meta Ads" : "Google Ads"} ·{" "}
                    {a.lastSyncedAt
                      ? `Synchronisé ${relativeTime(a.lastSyncedAt)}`
                      : "Jamais synchronisé"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">ID externe</p>
                  <p className="text-sm font-mono">{a.externalId}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <h2 className="text-lg font-semibold">Aucun compte publicitaire connecté</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Connectez votre compte Meta Ads ou Google Ads depuis la page Intégrations
        pour commencer à importer vos campagnes et automatiser vos optimisations.
      </p>
      <a href="/integrations" className="btn-primary mt-6 inline-flex">
        Aller aux intégrations
      </a>
    </div>
  );
}
