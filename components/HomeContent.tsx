"use client";

import { HomeHotPicks } from "@/components/HomeHotPicks";
import { HomeSearch } from "@/components/HomeSearch";
import { HomePicksSkeleton } from "@/components/Skeleton";
import { StatusPanel } from "@/components/StatusPanel";
import type { HomeLens } from "@/lib/hot-picks";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LENS_STORAGE_KEY = "探店参谋:homePickLens";
const GUARD_MS = 2000;

interface HomeContentProps {
  lenses: HomeLens[];
  picksError?: string | null;
}

function takeLensIndex(count: number): number {
  if (count < 1) {
    throw new Error("首页维度数量必须为正整数");
  }
  const store = window as unknown as {
    __tandianHomeLens?: { index: number; at: number };
  };
  const now = Date.now();
  if (store.__tandianHomeLens && now - store.__tandianHomeLens.at < GUARD_MS) {
    return store.__tandianHomeLens.index;
  }
  const raw = sessionStorage.getItem(LENS_STORAGE_KEY);
  const last = raw === null ? -1 : Number.parseInt(raw, 10);
  const next = ((Number.isFinite(last) ? last : -1) + 1) % count;
  sessionStorage.setItem(LENS_STORAGE_KEY, String(next));
  store.__tandianHomeLens = { index: next, at: now };
  return next;
}

export function HomeContent({ lenses, picksError = null }: HomeContentProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<HomeLens | null>(null);

  useEffect(() => {
    if (lenses.length === 0) {
      setLens(null);
      return;
    }
    const index = takeLensIndex(lenses.length);
    setLens(lenses[index] ?? lenses[0] ?? null);
  }, [lenses]);

  function applyPick(next: string): void {
    setQuery(next);
    document.getElementById("home-query")?.focus();
  }

  let picksSlot;
  if (picksError) {
    picksSlot = (
      <section className="mt-10 w-full min-w-0">
        <StatusPanel
          kind="error"
          title="热门店暂时看不了"
          message={picksError}
          primary={{ label: "刷新试试", onClick: () => router.refresh() }}
        />
      </section>
    );
  } else if (lenses.length === 0) {
    picksSlot = (
      <section className="mt-10 w-full min-w-0">
        <StatusPanel
          kind="empty"
          title="还没有可展示的店"
          message="库里暂时没有商家。你仍可以在上面说一句想怎么吃。"
        />
      </section>
    );
  } else if (!lens) {
    picksSlot = <HomePicksSkeleton />;
  } else if (lens.picks.length === 0) {
    picksSlot = (
      <section className="mt-10 w-full min-w-0">
        <p className="text-xs font-medium text-neutral-500">{lens.title}</p>
        <div className="mt-3">
          <StatusPanel
            compact
            kind="empty"
            title="这一栏暂时是空的"
            message="先在上面说一句需求，参谋会从评价里找店。"
          />
        </div>
      </section>
    );
  } else {
    picksSlot = <HomeHotPicks lens={lens} onPick={applyPick} />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-center">
      <HomeSearch query={query} onQueryChange={setQuery} />
      {picksSlot}
    </div>
  );
}
