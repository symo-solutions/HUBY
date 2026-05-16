import { LogAction } from "@/lib/enums";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/platform-badge";
import { formatDate } from "@/lib/utils";
import {
  AlertCircle,
  ArrowUpRight,
  Flag,
  PauseCircle,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const user = await requireUser();

  const logs = await prisma.automationLog.findMany({
    where: { userId: user.id },
    include: { campaign: true, rule: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Journal d'automatisation"
        description="Toutes les actions effectuées par le moteur de règles, par ordre chronologique."
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Message</th>
              <th className="px-5 py-3">Campagne</th>
              <th className="px-5 py-3">Statut</th>
              <th className="px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {iconFor(l.action)}
                    {labelFor(l.action)}
                  </div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{l.message}</td>
                <td className="px-5 py-3">{l.campaign?.name ?? "—"}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={l.status} />
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {formatDate(l.createdAt)}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  Aucune action automatique. Activez vos règles depuis
                  Intégrations et lancez une synchronisation pour voir les
                  entrées apparaître ici.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function iconFor(action: LogAction | string) {
  switch (action) {
    case LogAction.CAMPAIGN_PAUSED:
      return <PauseCircle className="h-4 w-4 text-amber-600" />;
    case LogAction.BUDGET_INCREASED:
      return <ArrowUpRight className="h-4 w-4 text-emerald-600" />;
    case LogAction.CAMPAIGN_FLAGGED:
      return <Flag className="h-4 w-4 text-amber-600" />;
    case LogAction.ALERT_GENERATED:
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    case LogAction.RULE_EVALUATED:
      return <Sparkles className="h-4 w-4 text-muted-foreground" />;
  }
}

function labelFor(action: LogAction | string) {
  switch (action) {
    case LogAction.CAMPAIGN_PAUSED:
      return "Campagne en pause";
    case LogAction.BUDGET_INCREASED:
      return "Budget augmenté";
    case LogAction.CAMPAIGN_FLAGGED:
      return "Campagne signalée";
    case LogAction.ALERT_GENERATED:
      return "Alerte";
    case LogAction.RULE_EVALUATED:
      return "Règle évaluée";
  }
}
