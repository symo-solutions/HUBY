/**
 * Minimal LLM client for the agent.
 *
 * - If OPENAI_API_KEY is set: hits the OpenAI Chat Completions API with tool
 *   calling (gpt-4o-mini by default).
 * - Otherwise: returns null and the caller falls back to a deterministic
 *   intent parser (see lib/agent.ts) so the chat works out-of-the-box for
 *   the demo without paying for tokens.
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
    throw new Error("OPENAI_API_KEY not set");
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
  // OpenAI's API rejects "null" content for some message types; normalize.
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
