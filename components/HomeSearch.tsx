"use client";

import { SCENE_TEMPLATES, nextSceneQuery, sceneQueriesInclude } from "@/lib/home-templates";
import { useRouter } from "next/navigation";
import { useRef, type FormEvent } from "react";

const QUERY_MAX = 500;

interface HomeSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function HomeSearch({ query, onQueryChange }: HomeSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function applyTemplate(label: string): void {
    const template = SCENE_TEMPLATES.find((item) => item.label === label);
    if (!template) {
      throw new Error(`未知用餐类型：${label}`);
    }
    onQueryChange(nextSceneQuery(template, query));
    inputRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") {
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length > QUERY_MAX) {
      throw new Error(`需求不能超过 ${QUERY_MAX} 字`);
    }
    router.push(`/confirm?query=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full min-w-0 flex-col items-center gap-4 sm:gap-5">
      <label htmlFor="home-query" className="sr-only">
        探店需求
      </label>
      <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl bg-white py-1.5 pr-1.5 pl-4 shadow-[0_8px_28px_rgba(26,26,26,0.08)] ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-brand sm:rounded-full sm:py-2 sm:pr-2 sm:pl-5">
        <input
          id="home-query"
          ref={inputRef}
          type="text"
          value={query}
          maxLength={QUERY_MAX}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="带父母吃饭，要安静有包间…"
          onChange={(event) => onQueryChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-foreground outline-none placeholder:text-neutral-400"
        />
        <button
          type="submit"
          disabled={query.trim() === ""}
          className="shrink-0 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition enabled:hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
        >
          问问
        </button>
      </div>

      <div className="flex w-full min-w-0 max-w-full flex-wrap justify-center gap-2">
        {SCENE_TEMPLATES.map((item) => {
          const active = sceneQueriesInclude(item, query);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => applyTemplate(item.label)}
              className={`min-h-10 rounded-full px-3.5 py-2 text-sm transition ${
                active
                  ? "bg-brand font-medium text-brand-ink"
                  : "bg-white/80 text-neutral-700 ring-1 ring-black/5 hover:bg-white hover:ring-black/10"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </form>
  );
}
