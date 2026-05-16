/**
 * Orchestrateur de l'agent IA.
 *
 * Exécute un tour de chat : transmet les messages au LLM, exécute les
 * appels d'outils côté serveur, et boucle jusqu'à ce que le modèle
 * produise un message final (ou que le budget d'étapes soit atteint).
 *
 * Bascule sur un parseur d'intention déterministe quand OPENAI_API_KEY
 * n'est pas défini.
 */

import { prisma } from "@/lib/db";
import { CampaignStatus } from "@/lib/enums";
import {
  callLLM,
  isLLMAvailable,
  type LLMMessage,
  type LLMToolCall,
} from "@/lib/llm";
import {
  TOOLS,
  executeTool,
  type ToolName,
  type ToolResult,
} from "@/lib/agent-tools";

export type ChatTurnInput = {
  userId: string;
  // Historique de conversation SANS les messages « system ». L'orchestrateur
  // injecte son propre prompt système (avec contexte utilisateur frais) à chaque tour.
  history: { role: "user" | "assistant"; content: string }[];
};

export type AgentAction = {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
};

export type ChatTurnOutput = {
  message: string;
  actions: AgentAction[];
  mode: "openai" | "mock";
};

const MAX_STEPS = 5;

export async function runChatTurn(
  input: ChatTurnInput,
): Promise<ChatTurnOutput> {
  if (isLLMAvailable()) {
    return runWithLLM(input);
  }
  return runWithMock(input);
}

// ---------------------------------------------------------------------------
// Mode LLM (OpenAI)
// ---------------------------------------------------------------------------

async function runWithLLM(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const systemPrompt = await buildSystemPrompt(input.userId);
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: AgentAction[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callLLM(messages, TOOLS);
    if (response.toolCalls.length === 0) {
      return {
        message:
          response.content ??
          "(Pas de réponse — réessayez en reformulant votre demande.)",
        actions,
        mode: "openai",
      };
    }

    // Ajoute à l'historique le message assistant qui appelle les outils
    messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls,
    });

    // Exécute chaque outil et ajoute son résultat à l'historique
    for (const call of response.toolCalls) {
      const args = parseArgs(call);
      const result = await executeTool(input.userId, call.function.name, args);
      actions.push({ tool: call.function.name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    message:
      "J'ai pris plusieurs actions mais la réponse a été tronquée. Demandez-moi un récapitulatif si besoin.",
    actions,
    mode: "openai",
  };
}

function parseArgs(call: LLMToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function buildSystemPrompt(userId: string): Promise<string> {
  const [accounts, campaigns] = await Promise.all([
    prisma.adAccount.findMany({
      where: { userId },
      select: { id: true, name: true, platform: true, currency: true },
    }),
    prisma.campaign.findMany({
      where: { adAccount: { userId } },
      include: { adAccount: { select: { platform: true } } },
      orderBy: { spend: "desc" },
      take: 30,
    }),
  ]);

  const accountsBlock = accounts.length
    ? accounts
        .map(
          (a) =>
            `- ${a.platform} | ${a.name} (id: ${a.id}, currency: ${a.currency ?? "EUR"})`,
        )
        .join("\n")
    : "(aucun compte connecté)";

  const campaignsBlock = campaigns.length
    ? campaigns
        .map(
          (c) =>
            `- [${c.status}] ${c.adAccount.platform} | "${c.name}" id=${c.id} | spend=${c.spend.toFixed(0)} ROAS=${c.roas ?? "—"} CTR=${c.ctr ?? "—"}%`,
        )
        .join("\n")
    : "(aucune campagne)";

  return [
    "Tu es l'assistant IA de Smart Ads Controller, un SaaS de pilotage de campagnes Meta Ads et Google Ads.",
    "Tu réponds en français, de manière concise et professionnelle. Tu tutoies l'utilisateur.",
    "",
    "Tu disposes d'outils pour CRÉER des campagnes (en local, pour démo), LISTER, METTRE EN PAUSE, REPRENDRE, MODIFIER LE BUDGET, SUPPRIMER, et déclencher l'évaluation des règles d'automatisation.",
    "Quand tu effectues une action, confirme-la brièvement. Ne dis pas 'je vais faire X' — fais-le, puis dis 'OK, X effectué'.",
    "Si l'utilisateur demande des données (KPIs, liste, top), utilise get_summary ou list_campaigns.",
    "Si plusieurs campagnes correspondent à un nom partiel, demande confirmation avant d'agir.",
    "Pour créer une campagne de démo qui déclenche une règle, utilise un preset (winner / loser / lowctr / noconv).",
    "",
    "CONTEXTE UTILISATEUR (rafraîchi à chaque tour) :",
    "",
    "Comptes publicitaires :",
    accountsBlock,
    "",
    "Campagnes (30 plus dépensières) :",
    campaignsBlock,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Mode démo (sans OPENAI_API_KEY)
// ---------------------------------------------------------------------------

/**
 * Petit parseur d'intention. Volontairement minimaliste : il reconnaît les
 * tournures françaises (et quelques équivalents anglais) les plus
 * courantes pour que la démo fonctionne sans clé LLM.
 */
async function runWithMock(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const lastUser = [...input.history].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return {
      message:
        "Bonjour ! Je peux créer, mettre en pause, reprendre ou modifier vos campagnes. Essayez : « crée une campagne perdante », « liste mes campagnes » ou « fais-moi un résumé ».",
      actions: [],
      mode: "mock",
    };
  }

  const text = lastUser.content.toLowerCase().trim();
  const actions: AgentAction[] = [];
  let message = "";

  // ---- Salutation / aide
  if (/^(salut|bonjour|hello|hi|aide|help|\?)/.test(text)) {
    message = [
      "Salut ! Je suis l'assistant Smart Ads Controller.",
      "Je peux faire pour toi (sans clé OpenAI configurée, je comprends les phrases simples) :",
      "• « crée une campagne perdante / gagnante / faible CTR / sans conversion »",
      "• « liste mes campagnes » (option : « Meta » ou « Google »)",
      "• « mets en pause [nom] » / « reprends [nom] »",
      "• « augmente le budget de [nom] de 20 % » / « passe le budget de [nom] à 80 € »",
      "• « supprime [nom] »",
      "• « évalue les règles » / « fais-moi un résumé »",
    ].join("\n");
    return { message, actions, mode: "mock" };
  }

  // ---- Résumé
  if (/(résumé|résume|résumé|recap|recap|bilan|kpi|stats|summary)/.test(text)) {
    const result = await executeTool(input.userId, "get_summary", {});
    actions.push({ tool: "get_summary", args: {}, result });
    message = formatSummary(result);
    return { message, actions, mode: "mock" };
  }

  // ---- Évaluer les règles
  if (/(évalue|evalue|exécute|execute|run).*(règle|regle|rule)/.test(text)) {
    const result = await executeTool(input.userId, "evaluate_rules", {});
    actions.push({ tool: "evaluate_rules", args: {}, result });
    message = `Moteur de règles exécuté : ${result.actionsTaken ?? 0} action(s) effectuée(s).`;
    return { message, actions, mode: "mock" };
  }

  // ---- Créer une campagne
  const createMatch = /(crée|cree|créer|creer|nouvelle|new|create)/.test(text);
  if (createMatch && /(campagne|campaign)/.test(text)) {
    let preset: string | undefined;
    if (/(perdante|loser|low.?roas|faible.?roas)/.test(text)) preset = "loser";
    else if (/(gagnante|winner|high.?roas|fort.?roas|scaling)/.test(text))
      preset = "winner";
    else if (/(faible.?ctr|low.?ctr|ctr)/.test(text)) preset = "lowctr";
    else if (/(sans.?conversion|no.?conv|alerte)/.test(text)) preset = "noconv";

    const platform = /(google|adwords)/.test(text)
      ? "GOOGLE"
      : /\bmeta\b|facebook|instagram/.test(text)
        ? "META"
        : undefined;

    const presetLabels: Record<string, string> = {
      winner: "gagnante (ROAS élevé)",
      loser: "perdante (ROAS faible)",
      lowctr: "à faible CTR",
      noconv: "sans conversion",
    };

    const name = preset
      ? `Démo IA — ${presetLabels[preset]}`
      : `Démo IA — ${new Date().toLocaleDateString("fr-FR")}`;

    const result = await executeTool(input.userId, "create_campaign", {
      name,
      preset,
      platform,
    });
    actions.push({
      tool: "create_campaign",
      args: { name, preset, platform },
      result,
    });

    if (!result.ok) {
      message = `Je n'ai pas pu créer la campagne : ${result.error}`;
    } else {
      // Évalue les règles dans la foulée pour que l'utilisateur voie le moteur réagir
      const evalResult = await executeTool(input.userId, "evaluate_rules", {});
      actions.push({ tool: "evaluate_rules", args: {}, result: evalResult });
      const took = evalResult.actionsTaken ?? 0;
      message =
        `OK, j'ai créé « ${name} »${preset ? ` (preset ${preset})` : ""}.` +
        (took > 0
          ? ` Le moteur de règles a réagi avec ${took} action(s) — regarde le journal.`
          : " Le moteur n'a pris aucune action immédiate.");
    }
    return { message, actions, mode: "mock" };
  }

  // ---- Pause / reprise par nom
  const pauseMatch = text.match(
    /(pause|met[s]?.?en.?pause|stop|coupe).*?(?:campagne\s*)?["«»']?([^"«»']{2,})["«»']?\s*$/,
  );
  if (pauseMatch) {
    const name = pauseMatch[2].trim();
    return await runStatusChange(input.userId, name, CampaignStatus.PAUSED, "mise en pause");
  }
  const resumeMatch = text.match(
    /(reprend|réactive|reactive|relance|resume|active).*?(?:campagne\s*)?["«»']?([^"«»']{2,})["«»']?\s*$/,
  );
  if (resumeMatch) {
    const name = resumeMatch[2].trim();
    return await runStatusChange(input.userId, name, CampaignStatus.ACTIVE, "réactivée");
  }

  // ---- Modifier le budget par nom
  const budgetPctMatch = text.match(
    /(?:augmente|monte|baisse|réduis|reduis|change).*?(?:budget\s+(?:de|du|sur))?\s*["«»']?([^"«»']{2,}?)["«»']?\s+(?:de|à|a|to|by)?\s*(-?\d+)\s*%/,
  );
  if (budgetPctMatch) {
    const name = budgetPctMatch[1].trim();
    let pct = Number(budgetPctMatch[2]);
    if (/(baisse|réduis|reduis)/.test(text) && pct > 0) pct = -pct;
    const result = await executeTool(input.userId, "update_budget", {
      name,
      deltaPct: pct,
    });
    actions.push({
      tool: "update_budget",
      args: { name, deltaPct: pct },
      result,
    });
    message = result.ok
      ? `OK, budget de « ${result.name ?? name} » : ${result.previousBudget} € → ${result.newBudget} €.`
      : `Je n'ai pas pu modifier le budget : ${result.error}`;
    return { message, actions, mode: "mock" };
  }
  const budgetAbsMatch = text.match(
    /budget.*?(?:de|du|sur)\s*["«»']?([^"«»']{2,}?)["«»']?\s+(?:à|a|to)\s*(\d+)\s*€?/,
  );
  if (budgetAbsMatch) {
    const name = budgetAbsMatch[1].trim();
    const newBudget = Number(budgetAbsMatch[2]);
    const result = await executeTool(input.userId, "update_budget", {
      name,
      newBudget,
    });
    actions.push({
      tool: "update_budget",
      args: { name, newBudget },
      result,
    });
    message = result.ok
      ? `OK, budget de « ${result.name ?? name} » fixé à ${result.newBudget} €.`
      : `Je n'ai pas pu modifier le budget : ${result.error}`;
    return { message, actions, mode: "mock" };
  }

  // ---- Supprimer par nom
  const delMatch = text.match(
    /(supprime|delete|efface|retire).*?["«»']?([^"«»']{2,})["«»']?\s*$/,
  );
  if (delMatch) {
    const name = delMatch[2].trim();
    const result = await executeTool(input.userId, "delete_campaign", { name });
    actions.push({ tool: "delete_campaign", args: { name }, result });
    message = result.ok
      ? `OK, « ${result.name ?? name} » supprimée (local uniquement, sans effet sur Meta/Google).`
      : `Je n'ai pas pu supprimer : ${result.error}`;
    return { message, actions, mode: "mock" };
  }

  // ---- Lister
  if (/(liste|montre|list|show|affiche)/.test(text) && /(campagne|campaign)/.test(text)) {
    const platform = /(google|adwords)/.test(text)
      ? "GOOGLE"
      : /\bmeta\b|facebook|instagram/.test(text)
        ? "META"
        : undefined;
    const result = await executeTool(input.userId, "list_campaigns", {
      platform,
    });
    actions.push({
      tool: "list_campaigns",
      args: { platform },
      result,
    });
    message = formatList(result);
    return { message, actions, mode: "mock" };
  }

  // ---- Repli (intention non comprise)
  message = [
    "Je n'ai pas bien compris (mode démo, sans clé OpenAI). Voici ce que je sais faire :",
    "• « crée une campagne perdante » (ou gagnante / faible CTR / sans conversion)",
    "• « liste mes campagnes Meta »",
    "• « mets en pause [nom] »",
    "• « augmente le budget de [nom] de 25 % »",
    "• « fais-moi un résumé »",
    "",
    "Configurez OPENAI_API_KEY dans .env pour des conversations naturelles complètes.",
  ].join("\n");
  return { message, actions, mode: "mock" };
}

async function runStatusChange(
  userId: string,
  name: string,
  status: string,
  fr: string,
): Promise<ChatTurnOutput> {
  const tool = status === CampaignStatus.PAUSED ? "pause_campaign" : "resume_campaign";
  const result = await executeTool(userId, tool, { name });
  const actions: AgentAction[] = [{ tool, args: { name }, result }];
  const message = result.ok
    ? `OK, « ${result.name ?? name} » ${fr}.`
    : `Je n'ai pas pu effectuer l'action : ${result.error}`;
  return { message, actions, mode: "mock" };
}

function formatSummary(result: ToolResult): string {
  if (!result.ok) return `Erreur : ${result.error}`;
  const t = result.totals as Record<string, number>;
  const top = (result.top as Array<{ name: string; spend: number; roas: number | null }>) ?? [];
  const flagged = (result.flagged as Array<{ name: string }>) ?? [];
  const lines = [
    `📊 ${result.campaignCount} campagnes · ${result.activeCount} actives · ${result.pausedCount} en pause`,
    `Dépense ${formatEur(t.spend)} · Revenu ${formatEur(t.revenue)} · ROAS ${t.roas.toFixed(2)} · CTR ${t.ctr.toFixed(2)} %`,
  ];
  if (top.length) {
    lines.push("");
    lines.push("Top campagnes par dépense :");
    top.forEach((c, i) => {
      lines.push(
        `${i + 1}. ${c.name} — ${formatEur(c.spend)} (ROAS ${c.roas?.toFixed(2) ?? "—"})`,
      );
    });
  }
  if (flagged.length) {
    lines.push("");
    lines.push(`⚠ ${flagged.length} campagne(s) signalée(s) : ${flagged.map((f) => f.name).join(", ")}`);
  }
  return lines.join("\n");
}

function formatList(result: ToolResult): string {
  if (!result.ok) return `Erreur : ${result.error}`;
  const list = (result.campaigns as Array<{
    name: string;
    platform: string;
    status: string;
    spend: number;
    roas: number | null;
  }>) ?? [];
  if (list.length === 0) return "Aucune campagne ne correspond.";
  const lines = [`${list.length} campagne(s) :`, ""];
  list.slice(0, 15).forEach((c) => {
    lines.push(
      `• [${c.status}] ${c.platform} — ${c.name} | ${formatEur(c.spend)} (ROAS ${c.roas?.toFixed(2) ?? "—"})`,
    );
  });
  if (list.length > 15) lines.push(`… et ${list.length - 15} autre(s).`);
  return lines.join("\n");
}

function formatEur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
