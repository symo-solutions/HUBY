/**
 * Client LLM minimal pour l'agent.
 *
 * - Si OPENAI_API_KEY est défini : appelle l'API OpenAI Chat Completions
 *   avec « function calling » (gpt-4o-mini par défaut).
 * - Sinon : renvoie null et l'appelant bascule sur un parseur d'intention
 *   déterministe (voir lib/agent.ts), ce qui permet à la démo de
 *   fonctionner sans dépenser de jetons.
 */

export type LLMRole = "system" | "user" | "assistant" | "tool";

export type LLMMessage = {
  role: LLMRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
};

export type LLMToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type LLMTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LLMResponse = {
  content: string | null;
  toolCalls: LLMToolCall[];
};

export function isLLMAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function callLLM(
  messages: LLMMessage[],
  tools: LLMTool[],
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY n'est pas défini");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map(serializeMessage),
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: LLMToolCall[];
      };
    }>;
  };

  const msg = json.choices[0]?.message;
  return {
    content: msg?.content ?? null,
    toolCalls: msg?.tool_calls ?? [],
  };
}

function serializeMessage(m: LLMMessage) {
  // L'API OpenAI rejette un contenu « null » pour certains types de messages : on normalise.
  const base: Record<string, unknown> = { role: m.role };
  if (m.role === "tool") {
    base.tool_call_id = m.tool_call_id;
    base.content = m.content ?? "";
  } else if (m.role === "assistant") {
    base.content = m.content;
    if (m.tool_calls) base.tool_calls = m.tool_calls;
  } else {
    base.content = m.content ?? "";
  }
  if (m.name) base.name = m.name;
  return base;
}
