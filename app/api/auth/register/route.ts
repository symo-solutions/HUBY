import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { RuleType } from "@/lib/enums";
import { RULE_DEFAULTS } from "@/lib/rules-engine";
import { toJsonField } from "@/lib/json-field";

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(120),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const normalized = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    return NextResponse.json(
      { error: "Un compte avec cette adresse e-mail existe déjà." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email: normalized, passwordHash },
  });

  // Provisionne les règles d'automatisation par défaut (désactivées, prêtes à être activées)
  await prisma.automationRule.createMany({
    data: (Object.keys(RULE_DEFAULTS) as RuleType[]).map((type) => ({
      userId: user.id,
      type,
      enabled: false,
      threshold: RULE_DEFAULTS[type].threshold,
      windowDays: RULE_DEFAULTS[type].windowDays,
      params: toJsonField(RULE_DEFAULTS[type].params),
    })),
  });

  return NextResponse.json({ id: user.id, email: user.email });
}
