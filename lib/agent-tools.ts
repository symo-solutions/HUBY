/**
 * Tools the agent can call.
 *
 * Each tool has:
 *  - a JSON schema (used by OpenAI function calling)
 *  - a handler(userId, args) that runs server-side
 *
 * Handlers are responsible for authorization (every Prisma query MUST be
 * scoped by userId) and for returning a small JSON-serializable result that
 * the LLM can read on the next step.
 */

import { prisma } from "@/lib/db";
import { CampaignStatus, Platform } from "@/lib/enums";
import { evaluateRulesForUser } from "@/lib/rules-engine";
import type { LLMTool } from "@/lib/llm";

export type ToolName =
  | "create_campaign"
  | "list_campaigns"
  | "pause_campaign"
  | "resume_campaign"
  | "update_budget"
  | "delete_campaign"
  | "evaluate_rules"
  | "get_summary";

export const TOOLS: LLMTool[] = [
  {
    type: "function",
    function: {
      name: "create_campaign",
      description:
        "Create a new campaign in the local DB. Real Meta/Google APIs are NOT touched. Use a preset for quick demo scenarios, or specify custom metrics. Always pass a name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          platform: {
            type: "string",
            enum: ["META", "GOOGLE"],
            description:
              "If omitted, defaults to the user's first connected ad account.",
          },
          status: {
            type: "string",
            enum: ["ACTIVE", "PAUSED", "ARCHIVED"],
            description: "Defaults to ACTIVE.",
          },
          dailyBudget: { type: "number", description: "Daily budget" },
          objective: { type: "string", description: "e.g. CONVERSIONS, REACH" },
          preset: {
            type: "string",
            enum: ["winner", "loser", "lowctr", "noconv"],
            description:
              "Quick preset that pre-fills realistic metrics: 'winner' = high ROAS (~3.0), 'loser' = low ROAS (~0.4), 'lowctr' = CTR ~0.2%, 'noconv' = spend without conversion. Overrides spend/impressions/etc.",
          },
          spend: { type: "number" },
          impressions: { type: "number" },
          clicks: { type: "number" },
          conversions: { type: "number" },
          revenue: { type: "number" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_campaigns",
      description:
        "List the user's campaigns with their KPIs. Filter by platform and/or status.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["META", "GOOGLE"] },
          status: {
            type: "string",
            enum: ["ACTIVE", "PAUSED", "ARCHIVED"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_campaign",
      description: "Pause a campaign. Identify by id (preferred) or by name.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resume_campaign",
      description: "Resume (set ACTIVE) a campaign by id or by name.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_budget",
      description: "Update the daily budget of a campaign.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          name: { type: "string" },
          newBudget: { type: "number" },
          deltaPct: {
            type: "number",
            description:
              "Percentage delta (positive or negative) applied to the current budget. Either newBudget OR deltaPct.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_campaign",
      description:
        "Delete a campaign (local DB only — does not touch Meta/Google).",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_rules",
      description:
        "Run the automation rule engine immediately on the user's campaigns.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_summary",
      description:
        "Aggregated KPIs (spend, ROAS, CTR), top campaigns and flagged ones for the user.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export type ToolResult = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
};

const PRESETS = {
  winner: {
    spend: 1200,
    impressions: 120000,
    clicks: 3600,
    conversions: 180,
    revenue: 3600,
    dailyBudget: 60,
    objective: "CONVERSIONS",
    status: CampaignStatus.ACTIVE,
  },
  loser: {
    spend: 900,
    impressions: 60000,
    clicks: 1500,
    conversions: 20,
    revenue: 360,
    dailyBudget: 40,
    objective: "CONVERSIONS",
    status: CampaignStatus.ACTIVE,
  },
  lowctr: {
    spend: 300,
    impressions: 200000,
    clicks: 400,
    conversions: 5,
    revenue: 100,
    dailyBudget: 30,
    objective: "REACH",
    status: CampaignStatus.ACTIVE,
  },
  noconv: {
    spend: 150,
    impressions: 20000,
    clicks: 300,
    conversions: 0,
    revenue: 0,
    dailyBudget: 20,
    objective: "TRAFFIC",
    status: CampaignStatus.ACTIVE,
  },
} as const;

export async function executeTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name as ToolName) {
      case "create_campaign":
        return await createCampaign(userId, args);
      case "list_campaigns":
        return await listCampaigns(userId, args);
      case "pause_campaign":
        return await setStatus(userId, args, CampaignStatus.PAUSED);
      case "resume_campaign":
        return await setStatus(userId, args, CampaignStatus.ACTIVE);
      case "update_budget":
        return await updateBudget(userId, args);
      case "delete_campaign":
        return await deleteCampaign(userId, args);
      case "evaluate_rules":
        return await runEvaluateRules(userId);
      case "get_summary":
        return await getSummary(userId);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function findAdAccount(userId: string, platform?: string) {
  if (platform) {
    return prisma.adAccount.findFirst({
      where: { userId, platform },
      orderBy: { connectedAt: "desc" },
    });
  }
  return prisma.adAccount.findFirst({
    where: { userId },
    orderBy: { connectedAt: "desc" },
  });
}

async function findCampaignByIdOrName(
  userId: string,
  args: { campaignId?: unknown; name?: unknown },
) {
  if (typeof args.campaignId === "string" && args.campaignId) {
    return prisma.campaign.findFirst({
      where: { id: args.campaignId, adAccount: { userId } },
    });
  }
  if (typeof args.name === "string" && args.name) {
    // Best match: exact then prefix then contains
    const exact = await prisma.campaign.findFirst({
      where: { name: args.name, adAccount: { userId } },
    });
    if (exact) return exact;
    return prisma.campaign.findFirst({
      where: {
        name: { contains: args.name },
        adAccount: { userId },
      },
    });
  }
  return null;
}

async function createCampaign(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const name = String(args.name ?? "").trim();
  if (!name) return { ok: false, error: "Le nom est requis." };

  const platform = typeof args.platform === "string" ? args.platform : undefined;
  const account = await findAdAccount(userId, platform);
  if (!account) {
    return {
      ok: false,
      error:
        "Aucun compte publicitaire connecté. Connectez Meta ou Google depuis Intégrations.",
    };
  }

  const presetKey = typeof args.preset === "string" ? args.preset : undefined;
  const preset =
    presetKey && presetKey in PRESETS
      ? PRESETS[presetKey as keyof typeof PRESETS]
      : null;

  const status =
    (typeof args.status === "string" ? args.status : preset?.status) ??
    CampaignStatus.ACTIVE;
  const dailyBudget =
    typeof args.dailyBudget === "number"
      ? args.dailyBudget
      : preset?.dailyBudget ?? null;
  const objective =
    typeof args.objective === "string"
      ? args.objective
      : preset?.objective ?? null;

  const spend = pickNumber(args.spend, preset?.spend, 0);
  const impressions = pickNumber(args.impressions, preset?.impressions, 0);
  const clicks = pickNumber(args.clicks, preset?.clicks, 0);
  const conversions = pickNumber(args.conversions, preset?.conversions, 0);
  const revenue = pickNumber(args.revenue, preset?.revenue, 0);

  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const roas = spend > 0 ? +(revenue / spend).toFixed(2) : null;
  const ctr =
    impressions > 0 ? +((clicks / impressions) * 100).toFixed(3) : null;

  const campaign = await prisma.campaign.create({
    data: {
      adAccountId: account.id,
      externalId,
      name,
      status,
      dailyBudget,
      objective,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      roas,
      ctr,
    },
  });

  // Synthesize 7d daily metrics so windowed rules have data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const noise = (i % 3) * 0.1 - 0.1;
    await prisma.campaignMetric.create({
      data: {
        campaignId: campaign.id,
        date,
        spend: round2((spend / 30) * (1 + noise)),
        impressions: Math.round((impressions / 30) * (1 + noise)),
        clicks: Math.round((clicks / 30) * (1 + noise)),
        conversions: Math.round((conversions / 30) * (1 + noise)),
        revenue: round2((revenue / 30) * (1 + noise)),
      },
    });
  }

  return {
    ok: true,
    campaign: serializeCampaign(campaign, account),
    preset: presetKey ?? null,
  };
}

async function listCampaigns(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const platform =
    typeof args.platform === "string"
      ? (args.platform as Platform)
      : undefined;
  const status =
    typeof args.status === "string"
      ? (args.status as CampaignStatus)
      : undefined;

  const campaigns = await prisma.campaign.findMany({
    where: {
      adAccount: { userId, ...(platform ? { platform } : {}) },
      ...(status ? { status } : {}),
    },
    include: { adAccount: true },
    orderBy: { spend: "desc" },
    take: 50,
  });

  return {
    ok: true,
    count: campaigns.length,
    campaigns: campaigns.map((c) => serializeCampaign(c, c.adAccount)),
  };
}

async function setStatus(
  userId: string,
  args: Record<string, unknown>,
  status: string,
): Promise<ToolResult> {
  const campaign = await findCampaignByIdOrName(userId, args);
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  if (campaign.status === status) {
    return { ok: true, campaignId: campaign.id, alreadyInStatus: true, status };
  }
  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status },
  });
  return {
    ok: true,
    campaignId: updated.id,
    name: updated.name,
    previousStatus: campaign.status,
    status: updated.status,
  };
}

async function updateBudget(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const campaign = await findCampaignByIdOrName(userId, args);
  if (!campaign) return { ok: false, error: "Campagne introuvable." };

  let newBudget: number;
  if (typeof args.newBudget === "number") {
    newBudget = args.newBudget;
  } else if (typeof args.deltaPct === "number") {
    const current = campaign.dailyBudget ?? 0;
    if (current <= 0)
      return {
        ok: false,
        error: "La campagne n'a pas de budget journalier de référence.",
      };
    newBudget = Math.round(current * (1 + args.deltaPct / 100));
  } else {
    return {
      ok: false,
      error: "Précisez newBudget (€) ou deltaPct (%).",
    };
  }

  if (newBudget < 0) {
    return { ok: false, error: "Le budget doit être positif." };
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { dailyBudget: newBudget },
  });
  return {
    ok: true,
    campaignId: updated.id,
    name: updated.name,
    previousBudget: campaign.dailyBudget,
    newBudget: updated.dailyBudget,
  };
}

async function deleteCampaign(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const campaign = await findCampaignByIdOrName(userId, args);
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  await prisma.campaign.delete({ where: { id: campaign.id } });
  return { ok: true, deletedId: campaign.id, name: campaign.name };
}

async function runEvaluateRules(userId: string): Promise<ToolResult> {
  const result = await evaluateRulesForUser(userId);
  return { ok: true, ...result };
}

async function getSummary(userId: string): Promise<ToolResult> {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccount: { userId } },
    include: { adAccount: true },
  });

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

  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const top = [...campaigns]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      platform: c.adAccount.platform,
      status: c.status,
      spend: c.spend,
      roas: c.roas,
    }));

  const flagged = campaigns
    .filter((c) => c.flagged)
    .map((c) => ({ name: c.name, reason: c.flagReason }));

  return {
    ok: true,
    totals: {
      ...totals,
      roas: +roas.toFixed(2),
      ctr: +ctr.toFixed(3),
    },
    campaignCount: campaigns.length,
    activeCount: campaigns.filter((c) => c.status === CampaignStatus.ACTIVE)
      .length,
    pausedCount: campaigns.filter((c) => c.status === CampaignStatus.PAUSED)
      .length,
    top,
    flagged,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function serializeCampaign(
  c: {
    id: string;
    name: string;
    status: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number | null;
    ctr: number | null;
    dailyBudget: number | null;
  },
  account: { platform: string; currency: string | null },
) {
  return {
    id: c.id,
    name: c.name,
    platform: account.platform,
    status: c.status,
    dailyBudget: c.dailyBudget,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    conversions: c.conversions,
    revenue: c.revenue,
    roas: c.roas,
    ctr: c.ctr,
    currency: account.currency ?? "EUR",
  };
}
