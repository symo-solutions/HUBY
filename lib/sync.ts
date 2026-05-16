/**
 * Orchestrateur de synchronisation des données.
 *
 * Pour chaque compte publicitaire connecté : récupère les campagnes et les
 * insights, fait un upsert en base et recalcule les métriques agrégées.
 * Lance ensuite le moteur de règles.
 */

import type { AdAccount } from "@prisma/client";
import { Platform } from "@/lib/enums";
import { prisma } from "@/lib/db";
import {
  fetchMetaCampaigns,
  fetchMetaInsights,
  type MetaCampaign,
  type MetaInsights,
} from "@/lib/meta-api";
import {
  fetchGoogleCampaigns,
  fetchGoogleInsights,
  type GoogleCampaign,
  type GoogleInsights,
} from "@/lib/google-ads-api";
import { evaluateRulesForUser } from "@/lib/rules-engine";

export type SyncResult = {
  accountsSynced: number;
  campaignsUpserted: number;
  metricsUpserted: number;
  rulesEvaluated: number;
  rulesActions: number;
  rulesErrors: number;
};

export async function syncAllUsers(): Promise<SyncResult[]> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: SyncResult[] = [];
  for (const user of users) {
    results.push(await syncUser(user.id));
  }
  return results;
}

export async function syncUser(userId: string): Promise<SyncResult> {
  const accounts = await prisma.adAccount.findMany({ where: { userId } });

  let campaignsUpserted = 0;
  let metricsUpserted = 0;

  for (const account of accounts) {
    const { campaigns, insights } = await fetchPlatformData(account);
    const merged = mergeCampaignsAndInsights(campaigns, insights);

    for (const item of merged) {
      const existing = await prisma.campaign.upsert({
        where: {
          adAccountId_externalId: {
            adAccountId: account.id,
            externalId: item.externalId,
          },
        },
        create: {
          adAccountId: account.id,
          externalId: item.externalId,
          name: item.name,
          status: item.status,
          dailyBudget: item.dailyBudget,
          objective: item.objective,
          spend: item.spend,
          impressions: item.impressions,
          clicks: item.clicks,
          conversions: item.conversions,
          revenue: item.revenue,
          roas: item.spend > 0 ? +(item.revenue / item.spend).toFixed(2) : null,
          ctr: item.impressions > 0
            ? +((item.clicks / item.impressions) * 100).toFixed(3)
            : null,
        },
        update: {
          name: item.name,
          status: item.status,
          dailyBudget: item.dailyBudget,
          objective: item.objective,
          spend: item.spend,
          impressions: item.impressions,
          clicks: item.clicks,
          conversions: item.conversions,
          revenue: item.revenue,
          roas: item.spend > 0 ? +(item.revenue / item.spend).toFixed(2) : null,
          ctr: item.impressions > 0
            ? +((item.clicks / item.impressions) * 100).toFixed(3)
            : null,
        },
      });
      campaignsUpserted += 1;
      metricsUpserted += await writeDailyMetrics(existing.id, item);
    }

    await prisma.adAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });
  }

  const ruleResult = await evaluateRulesForUser(userId);

  return {
    accountsSynced: accounts.length,
    campaignsUpserted,
    metricsUpserted,
    rulesEvaluated: ruleResult.evaluated,
    rulesActions: ruleResult.actionsTaken,
    rulesErrors: ruleResult.errors,
  };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

type Combined = MetaCampaign & MetaInsights;

async function fetchPlatformData(
  account: AdAccount,
): Promise<{
  campaigns: (MetaCampaign | GoogleCampaign)[];
  insights: (MetaInsights | GoogleInsights)[];
}> {
  if (account.platform === Platform.META) {
    const [campaigns, insights] = await Promise.all([
      fetchMetaCampaigns(account.accessToken, account.externalId),
      fetchMetaInsights(account.accessToken, account.externalId),
    ]);
    return { campaigns, insights };
  }
  const [campaigns, insights] = await Promise.all([
    fetchGoogleCampaigns(account.accessToken, account.externalId),
    fetchGoogleInsights(account.accessToken, account.externalId),
  ]);
  return { campaigns, insights };
}

function mergeCampaignsAndInsights(
  campaigns: (MetaCampaign | GoogleCampaign)[],
  insights: (MetaInsights | GoogleInsights)[],
): Combined[] {
  const insightsByExt = new Map(insights.map((i) => [i.externalId, i]));
  return campaigns.map((c) => {
    const i = insightsByExt.get(c.externalId);
    return {
      ...c,
      spend: i?.spend ?? 0,
      impressions: i?.impressions ?? 0,
      clicks: i?.clicks ?? 0,
      conversions: i?.conversions ?? 0,
      revenue: i?.revenue ?? 0,
    } as Combined;
  });
}

async function writeDailyMetrics(
  campaignId: string,
  combined: Combined,
): Promise<number> {
  // Pour le MVP, on synthétise 7 jours de métriques quotidiennes à partir
  // de l'agrégat 30 j (chaque plateforme expose un détail journalier ; on
  // simplifie ici pour le MVP).
  const daysBack = 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailySpend = combined.spend / 30;
  const dailyImpr = combined.impressions / 30;
  const dailyClicks = combined.clicks / 30;
  const dailyConv = combined.conversions / 30;
  const dailyRevenue = combined.revenue / 30;

  let written = 0;
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    // léger bruit déterministe basé sur l'index du jour
    const noise = (i % 3) * 0.1 - 0.1;
    await prisma.campaignMetric.upsert({
      where: { campaignId_date: { campaignId, date } },
      create: {
        campaignId,
        date,
        spend: round2(dailySpend * (1 + noise)),
        impressions: Math.round(dailyImpr * (1 + noise)),
        clicks: Math.round(dailyClicks * (1 + noise)),
        conversions: Math.round(dailyConv * (1 + noise)),
        revenue: round2(dailyRevenue * (1 + noise)),
      },
      update: {
        spend: round2(dailySpend * (1 + noise)),
        impressions: Math.round(dailyImpr * (1 + noise)),
        clicks: Math.round(dailyClicks * (1 + noise)),
        conversions: Math.round(dailyConv * (1 + noise)),
        revenue: round2(dailyRevenue * (1 + noise)),
      },
    });
    written += 1;
  }
  return written;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
