import { Platform, type RuleType } from "@/lib/enums";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { relativeTime } from "@/lib/utils";
import { Check, ExternalLink, Plug } from "lucide-react";
import { RULE_DEFAULTS, RULE_DESCRIPTIONS, RULE_LABELS } from "@/lib/rules-engine";
import { fromJsonField } from "@/lib/json-field";
import { RuleToggle } from "./rule-toggle";
import { DisconnectButton } from "./disconnect-button";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireUser();

  const [accounts, rules] = await Promise.all([
    prisma.adAccount.findMany({
      where: { userId: user.id },
      orderBy: { connectedAt: "desc" },
    }),
    prisma.automationRule.findMany({
      where: { userId: user.id },
      orderBy: { type: "asc" },
    }),
  ]);

  const metaAccount = accounts.find((a) => a.platform === Platform.META);
  const googleAccount = accounts.find((a) => a.platform === Platform.GOOGLE);

  return (
    <div>
      <PageHeader
        title="Intégrations"
        description="Connectez vos comptes publicitaires et configurez vos règles d'automatisation."
      />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Comptes publicitaires
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ProviderCard
            platform={Platform.META}
            connected={!!metaAccount}
            account={metaAccount ?? null}
            authUrl="/api/integrations/meta/connect"
          />
          <ProviderCard
            platform={Platform.GOOGLE}
            connected={!!googleAccount}
            account={googleAccount ?? null}
            authUrl="/api/integrations/google/connect"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Règles d&apos;automatisation
        </h2>
        <div className="grid gap-4">
          {(Object.keys(RULE_DEFAULTS) as RuleType[]).map((type) => {
            const rule = rules.find((r) => r.type === type);
            return (
              <RuleToggle
                key={type}
                type={type}
                label={RULE_LABELS[type]}
                description={RULE_DESCRIPTIONS[type]}
                rule={
                  rule
                    ? {
                        id: rule.id,
                        enabled: rule.enabled,
                        threshold: rule.threshold,
                        windowDays: rule.windowDays,
                        params: fromJsonField<Record<string, unknown>>(rule.params) ?? {},
                      }
                    : null
                }
                defaults={RULE_DEFAULTS[type]}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProviderCard({
  platform,
  connected,
  account,
  authUrl,
}: {
  platform: Platform;
  connected: boolean;
  account: { id: string; name: string; lastSyncedAt: Date | null } | null;
  authUrl: string;
}) {
  const name = platform === Platform.META ? "Meta Ads" : "Google Ads";
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PlatformBadge platform={platform} />
            <h3 className="font-semibold">{name}</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {platform === Platform.META
              ? "Importez les campagnes et insights depuis votre compte Meta Business."
              : "Importez les campagnes et insights depuis votre compte Google Ads MCC."}
          </p>
        </div>
        {connected ? (
          <span className="badge bg-emerald-50 text-emerald-700">
            <Check className="mr-1 h-3 w-3" />
            Connecté
          </span>
        ) : (
          <span className="badge bg-slate-100 text-slate-600">Non connecté</span>
        )}
      </div>

      {connected && account && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="font-medium">{account.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {account.lastSyncedAt
              ? `Synchronisé ${relativeTime(account.lastSyncedAt)}`
              : "Jamais synchronisé"}
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        {connected ? (
          <DisconnectButton accountId={account!.id} />
        ) : (
          <a href={authUrl} className="btn-primary">
            <Plug className="h-4 w-4" />
            Connecter {name}
          </a>
        )}
        <a
          href={
            platform === Platform.META
              ? "https://developers.facebook.com/docs/marketing-api"
              : "https://developers.google.com/google-ads/api/docs/start"
          }
          target="_blank"
          rel="noreferrer"
          className="btn-ghost text-muted-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          Documentation
        </a>
      </div>
    </div>
  );
}
