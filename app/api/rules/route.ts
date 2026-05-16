import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RULE_DEFAULTS } from "@/lib/rules-engine";
import { RULE_TYPE_VALUES } from "@/lib/enums";
import { fromJsonField, toJsonField } from "@/lib/json-field";

const ruleSchema = z.object({
  type: z.enum(RULE_TYPE_VALUES),
  enabled: z.boolean(),
  threshold: z.number().optional(),
  windowDays: z.number().int().min(1).max(60).optional(),
  params: z.record(z.unknown()).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rules = await prisma.automationRule.findMany({
    where: { userId: user.id },
  });
  // Decode params JSON for client consumption.
  return NextResponse.json(
    rules.map((r) => ({ ...r, params: fromJsonField(r.params) ?? {} })),
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { type, enabled, threshold, windowDays, params } = parsed.data;
  const defaults = RULE_DEFAULTS[type];

  const serializedParams = toJsonField(params ?? defaults.params);
  const rule = await prisma.automationRule.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: {
      userId: user.id,
      type,
      enabled,
      threshold: threshold ?? defaults.threshold,
      windowDays: windowDays ?? defaults.windowDays,
      params: serializedParams,
    },
    update: {
      enabled,
      threshold: threshold ?? defaults.threshold,
      windowDays: windowDays ?? defaults.windowDays,
      params: serializedParams,
    },
  });
  return NextResponse.json({ ...rule, params: fromJsonField(rule.params) ?? {} });
}
