"use client";

import * as React from "react";
import { Bot, Send, Loader2, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "What's going on with my pipeline?",
  "Who do I need to call today?",
  "Find deals in Spring, TX",
  "Send my highest-scoring deal to buyers",
];

export function AgentChat() {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      const reply = json?.data?.reply ?? json?.error ?? "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Couldn't reach the agent. Is the server running?" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-3xl tracking-wide">
          <Bot className="h-7 w-7 text-primary" /> Command
        </h1>
        <p className="text-sm text-muted-foreground">
          Your AI orchestrator. Ask anything about your pipeline, deals, or buyers.
        </p>
      </div>

      {/* Messages */}
      <Card ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary shadow-glow-sm">
              <Bot className="h-7 w-7" />
            </div>
            <div>
              <p className="font-heading text-xl tracking-wide">Ask your command center</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                I see your whole pipeline live. Try one of these:
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  m.role === "user" ? "bg-muted text-foreground" : "bg-primary/15 text-primary"
                }`}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </Card>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your orchestrator anything…"
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary/50"
          disabled={loading}
        />
        <Button type="submit" variant="brand" size="icon" disabled={loading || !input.trim()} aria-label="Send">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
