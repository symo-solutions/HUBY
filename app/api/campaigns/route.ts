/**
 * POST /api/campaigns - manually create a campaign in the local DB.
 *
 * Used for testing/demo purposes (option A). The campaign is attached to
 * one of the user's existing AdAccounts and gets synthetic per-day metrics
 * for the last 7 days, so the rule engine can immediately act on it.
 *
 * Real campaigns flow through `lib/sync.ts` (Meta + Google APIs) and never
 * touch this endpoint.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CAMPAIGN_STATUS_VALUES } from "@/lib/enums";
import { evaluateRulesForUser } from "@/lib/rules-engine";

const createSchema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().min(1).max(120),
  status: z.enum(CAMPAIGN_STATUS_VALUES).default("ACTIVE"),
  dailyBudget: z.number().nonnegative().nullish(),
  objective: z.string().max(80).nullish(),
  // Optional aggregate metrics (last 30d). If provided, we synthesize 7d of
  // daily metrics so the rule engine has a window to evaluate against.
  spend: z.number().nonnegative().default(0),
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  conversions: z.number().int().nonnegative().default(0),
  revenue: z.number().nonnegative().default(0),
  // If true, run the rule engine right after creating the campaign.
  evaluateRules: z.boolean().default(true),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Authorization: the ad account must belong to the user.
  const account = await prisma.adAccount.findFirst({
    where: { id: data.adAccountId, userId: user.id },
  });
  if (!account) {
    return NextResponse.json(
      { error: "Compte publicitaire introuvable" },
      { status: 404 },
    );
  }

  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const roas = data.spend > 0 ? +(data.revenue / data.spend).toFixed(2) : null;
  const ctr =
    data.impressions > 0
      ? +((data.clicks / data.impressions) * 100).toFixed(3)
      : null;

  const campaign = await prisma.campaign.create({
    data: {
      adAccountId: account.id,
      externalId,
      name: data.name,
      status: data.status,
      dailyBudget: data.dailyBudget ?? null,
      objective: data.objective ?? null,
      spend: data.spend,
      impressions: data.impressions,
      clicks: data.clicks,
      conversions: data.conversions,
      revenue: data.revenue,
      roas,
      ctr,
    },
  });

  // Synthesize 7d of daily metrics from the 30d aggregate so windowed rules
  // (PAUSE_LOW_ROAS, FLAG_LOW_CTR, ALERT_NO_CONVERSION) have data to chew on.
  const days = 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailySpend = data.spend / 30;
  const dailyImpr = data.impressions / 30;
  const dailyClicks = data.clicks / 30;
  const dailyConv = data.conversions / 30;
  const dailyRevenue = data.revenue / 30;

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    // small deterministic noise for variety
    const noise = (i % 3) * 0.1 - 0.1;
    await prisma.campaignMetric.create({
      data: {
        campaignId: campaign.id,
        date,
        spend: round2(dailySpend * (1 + noise)),
        impressions: Math.round(dailyImpr * (1 + noise)),
        clicks: Math.round(dailyClicks * (1 + noise)),
        conversions: Math.round(dailyConv * (1 + noise)),
        revenue: round2(dailyRevenue * (1 + noise)),
      },
    });
  }

  let rulesActions = 0;
  if (data.evaluateRules) {
    const result = await evaluateRulesForUser(user.id);
    rulesActions = result.actionsTaken;
  }

  return NextResponse.json({
    ok: true,
    campaign,
    rulesActions,
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
