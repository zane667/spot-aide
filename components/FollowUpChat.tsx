"use client";

import { streamFollowup } from "@/lib/client-api";
import type { AnalyzeCandidate, ChatTurn, ParseNeed, RecommendResult } from "@/lib/schemas";
import { useState, type FormEvent } from "react";
import { StatusPanel } from "./StatusPanel";

interface FollowUpChatProps {
  needs: ParseNeed;
  candidates: AnalyzeCandidate[];
  result: RecommendResult;
}

export function FollowUpChat({ needs, candidates, result }: FollowUpChatProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);

  async function sendFollowup(text: string): Promise<void> {
    if (busy) {
      return;
    }
    const last = messages[messages.length - 1];
    const history: ChatTurn[] =
      last?.role === "user" && last.content === text
        ? messages
        : [...messages, { role: "user", content: text }];
    setError(null);
    setFailedText(null);
    setBusy(true);
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const reply = await streamFollowup(needs, candidates, result, history, (chunk) => {
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (!last || last.role !== "assistant") {
            return next;
          }
          next[next.length - 1] = { role: "assistant", content: last.content + chunk };
          return next;
        });
      });
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setFailedText(text);
      setMessages(history);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || busy) {
      return;
    }
    setDraft("");
    await sendFollowup(text);
  }

  return (
    <section className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="text-xs font-medium text-neutral-500">继续追问</p>
      <p className="mt-1 text-xs text-neutral-400">例如：第一家有没有适合小孩的菜？</p>

      {messages.length > 0 ? (
        <ul className="mt-4 flex max-h-72 min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain">
          {messages.map((item, index) => (
            <li
              key={`${item.role}-${index}`}
              className={`max-w-[85%] break-words rounded-2xl px-3 py-2 text-sm leading-6 ${
                item.role === "user"
                  ? "self-end bg-brand/80 text-brand-ink"
                  : "self-start bg-neutral-50 text-neutral-800"
              }`}
            >
              {item.content ||
                (busy && item.role === "assistant" ? (
                  <span className="inline-flex gap-1 py-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-neutral-300" />
                    <span className="size-1.5 animate-pulse rounded-full bg-neutral-300 [animation-delay:150ms]" />
                    <span className="size-1.5 animate-pulse rounded-full bg-neutral-300 [animation-delay:300ms]" />
                  </span>
                ) : (
                  "（没有回复）"
                ))}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="mt-3">
          <StatusPanel
            compact
            kind="error"
            title="这一句没问成"
            message={error}
            primary={
              failedText
                ? {
                    label: "再发一次",
                    onClick: () => {
                      void sendFollowup(failedText);
                    },
                  }
                : undefined
            }
          />
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3 flex min-w-0 gap-2">
        <label htmlFor="followup-input" className="sr-only">
          追问
        </label>
        <input
          id="followup-input"
          value={draft}
          maxLength={500}
          disabled={busy}
          placeholder="再问一句…"
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-full bg-neutral-50 px-4 py-2.5 text-base outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-brand disabled:opacity-50 sm:text-sm"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          className="min-h-10 shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40"
        >
          {busy ? "…" : "发送"}
        </button>
      </form>
    </section>
  );
}
