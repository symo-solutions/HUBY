/**
 * Crée un compte de démonstration.
 *
 *   npm run db:seed
 *
 * Identifiants : demo@smart-ads.dev / demo12345
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { Platform, RuleType } from "../lib/enums";
import { RULE_DEFAULTS } from "../lib/rules-engine";
import { toJsonField } from "../lib/json-field";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@smart-ads.dev";
  const passwordHash = await bcrypt.hash("demo12345", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name: "Utilisateur Démo", passwordHash },
  });

  await prisma.adAccount.upsert({
    where: {
      userId_platform_externalId: {
        userId: user.id,
        platform: Platform.META,
        externalId: "act_1000001",
      },
    },
    create: {
      userId: user.id,
      platform: Platform.META,
      externalId: "act_1000001",
      name: "Compte Meta Démo",
      currency: "EUR",
      accessToken: "mock-meta-token-seed",
    },
    update: {},
  });

  await prisma.adAccount.upsert({
    where: {
      userId_platform_externalId: {
        userId: user.id,
        platform: Platform.GOOGLE,
        externalId: "customers/9876543210",
      },
    },
    create: {
      userId: user.id,
      platform: Platform.GOOGLE,
      externalId: "customers/9876543210",
      name: "Compte Google Démo",
      currency: "EUR",
      accessToken: "mock-google-token-seed",
      refreshToken: "mock-google-refresh-seed",
    },
    update: {},
  });

  for (const type of Object.keys(RULE_DEFAULTS) as RuleType[]) {
    await prisma.automationRule.upsert({
      where: { userId_type: { userId: user.id, type } },
      create: {
        userId: user.id,
        type,
        enabled: true,
        threshold: RULE_DEFAULTS[type].threshold,
        windowDays: RULE_DEFAULTS[type].windowDays,
        params: toJsonField(RULE_DEFAULTS[type].params),
      },
      update: {},
    });
  }

  console.log(`Compte de démonstration créé : ${email} (mot de passe : demo12345)`);
  console.log("Lancez une synchronisation depuis /dashboard pour peupler campagnes et métriques.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
