"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Bot,
  Loader2,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";

type ChatRole = "user" | "assistant";

type AgentAction = {
  tool: string;
  args: Record<string, unknown>;
  result: { ok?: boolean; error?: string } & Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  actions?: AgentAction[];
  timestamp: number;
};

type ChatResponse = {
  message: string;
  actions: AgentAction[];
  mode: "openai" | "mock";
};

const SUGGESTIONS = [
  "Crée une campagne perdante pour tester",
  "Crée une campagne gagnante (ROAS élevé)",
  "Liste mes campagnes Meta",
  "Fais-moi un résumé",
];

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Salut 👋 Je peux créer, mettre en pause, modifier ou supprimer tes campagnes — dis-moi simplement ce que tu veux faire. Quelques idées ci-dessous.",
  timestamp: Date.now(),
};

export function AgentChat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"openai" | "mock" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      // Auto-scroll to bottom + focus input
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
        inputRef.current?.focus();
      });
    }
  }, [open, messages]);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const history = newMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as ChatResponse;
      setMode(data.mode);

      const reply: ChatMessage = {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: data.message,
        actions: data.actions,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, reply]);

      // If the agent did anything that could change page data, refresh it
      const hasMutating = data.actions?.some(
        (a) =>
          a.tool === "create_campaign" ||
          a.tool === "pause_campaign" ||
          a.tool === "resume_campaign" ||
          a.tool === "update_budget" ||
          a.tool === "delete_campaign" ||
          a.tool === "evaluate_rules",
      );
      if (hasMutating) router.refresh();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          content: `Désolé, une erreur est survenue : ${(err as Error).message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        type="button"
        aria-label="Ouvrir l'assistant IA"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-600 text-white shadow-lg shadow-primary/30 transition hover:scale-105 active:scale-95"
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
        {!open && (
          <span className="absolute -right-1 -top-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
          </span>
        )}
      </button>

      {/* Slide-in panel */}
      <div
        className={`fixed bottom-24 right-6 z-40 flex w-[min(calc(100vw-3rem),420px)] flex-col rounded-2xl border border-border bg-white shadow-2xl transition-all ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
        style={{ height: "min(640px, calc(100vh - 8rem))" }}
        role="dialog"
        aria-label="Assistant IA"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-600 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Assistant IA</p>
              <p className="text-[11px] text-muted-foreground">
                {mode === "openai"
                  ? "OpenAI · function calling"
                  : mode === "mock"
                    ? "Mode démo (sans clé OpenAI)"
                    : "Smart Ads Controller"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 text-sm"
        >
          <div className="space-y-3">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">L&apos;agent réfléchit...</span>
              </div>
            )}
          </div>
        </div>

        {/* Suggestions when empty */}
        {messages.length === 1 && !loading && (
          <div className="border-t border-border px-3 py-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              Idées
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs transition hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Demande quelque chose..."
              rows={1}
              className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              aria-label="Envoyer"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Entrée pour envoyer · Maj+Entrée pour aller à la ligne
          </p>
        </div>
      </div>
    </>
  );
}

function Message({ message: m }: { message: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-600 text-white">
        <Bot className="h-3 w-3" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-foreground">
          {m.content}
        </div>
        {m.actions && m.actions.length > 0 && (
          <div className="space-y-1">
            {m.actions.map((a, i) => (
              <ActionChip key={i} action={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionChip({ action }: { action: AgentAction }) {
  const ok = action.result?.ok !== false;
  const label = TOOL_LABELS[action.tool] ?? action.tool;
  const detail = describeAction(action);
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">
          {ok ? "✓" : "✗"} {label}
        </div>
        {detail && (
          <div className="mt-0.5 text-[11px] opacity-80">{detail}</div>
        )}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  create_campaign: "Campagne créée",
  list_campaigns: "Campagnes listées",
  pause_campaign: "Campagne mise en pause",
  resume_campaign: "Campagne réactivée",
  update_budget: "Budget mis à jour",
  delete_campaign: "Campagne supprimée",
  evaluate_rules: "Règles évaluées",
  get_summary: "Résumé généré",
};

function describeAction(a: AgentAction): string | null {
  const r = a.result;
  if (r.error) return String(r.error);
  switch (a.tool) {
    case "create_campaign": {
      const c = r.campaign as { name?: string } | undefined;
      return c?.name ? `« ${c.name} »` : null;
    }
    case "pause_campaign":
    case "resume_campaign":
      return r.name ? `« ${r.name} »` : null;
    case "update_budget":
      return r.previousBudget !== undefined
        ? `${r.previousBudget} € → ${r.newBudget} €`
        : null;
    case "delete_campaign":
      return r.name ? `« ${r.name} »` : null;
    case "evaluate_rules":
      return `${r.actionsTaken ?? 0} action(s)`;
    case "list_campaigns":
      return `${r.count ?? 0} résultat(s)`;
    case "get_summary": {
      const t = r.totals as { spend?: number; roas?: number } | undefined;
      return t ? `Dépense ${t.spend?.toFixed(0)} € · ROAS ${t.roas?.toFixed(2)}` : null;
    }
    default:
      return null;
  }
}
