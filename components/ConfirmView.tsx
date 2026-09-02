"use client";

import { parseQuery } from "@/lib/client-api";
import { saveNeed } from "@/lib/need-session";
import type { ParseNeed } from "@/lib/schemas";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { ConfirmSkeleton } from "./Skeleton";
import { NeedTags } from "./NeedTags";
import { StatusPanel } from "./StatusPanel";

export function ConfirmView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = (searchParams.get("query") ?? "").trim();

  const [needs, setNeeds] = useState<ParseNeed | null>(null);
  const [loading, setLoading] = useState(query !== "");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (query === "") {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    parseQuery(query)
      .then((parsed) => {
        if (!cancelled) {
          setNeeds(parsed);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, retry]);

  function handleConfirm(): void {
    if (!needs) {
      throw new Error("还没有解析结果，不能开始分析");
    }
    saveNeed(needs);
    router.push("/results");
  }

  return (
    <div className="relative flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_#ffe58a_0%,_transparent_62%)]"
      />
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col px-4 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
        {query === "" ? (
          <div className="pt-8">
            <StatusPanel
              kind="empty"
              title="还没有需求"
              message="先回首页说一句想怎么吃，参谋才能拆成条件。"
              primary={{ label: "回首页", href: "/" }}
            />
          </div>
        ) : loading ? (
          <ConfirmSkeleton />
        ) : error ? (
          <div className="pt-8">
            <StatusPanel
              kind="error"
              title="没理解成条件"
              message={error}
              primary={{ label: "再试一次", onClick: () => setRetry((count) => count + 1) }}
              secondary={{ label: "回首页", href: "/" }}
            />
          </div>
        ) : needs ? (
          <section className="flex flex-col gap-6 pt-4">
            <div>
              <p className="text-xs text-neutral-500">你刚才说</p>
              <p className="mt-1 text-[15px] leading-6 break-words text-neutral-800">「{query}」</p>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">我理解成这些条件</h1>
              <p className="mt-1 text-sm text-neutral-500">点标签就能改，空着的可以补上</p>
            </div>
            <NeedTags needs={needs} onChange={setNeeds} />
            <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm leading-6 break-words text-neutral-600 ring-1 ring-black/5">
              {needs.inference}
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              className="min-h-12 w-full rounded-full bg-brand py-3 text-sm font-semibold text-brand-ink transition hover:brightness-95"
            >
              按这个找店
            </button>
          </section>
        ) : (
          <div className="pt-8">
            <StatusPanel
              kind="empty"
              title="没有解析结果"
              message="这次没有拆出可用条件，换一句再说，或回首页重来。"
              primary={{ label: "再试一次", onClick: () => setRetry((count) => count + 1) }}
              secondary={{ label: "回首页", href: "/" }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
