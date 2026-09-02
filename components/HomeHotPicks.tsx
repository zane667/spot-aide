"use client";

import type { HomeLens, HotPick } from "@/lib/hot-picks";
import { pickNeedQuery } from "@/lib/hot-picks";
import { formatSelectionRatePercent } from "@/lib/selection-rate";

interface HomeHotPicksProps {
  lens: HomeLens;
  onPick: (query: string) => void;
}

function badgeText(lens: HomeLens, pick: HotPick): string {
  if (lens.badge === "priorRate") {
    return `评价 ${formatSelectionRatePercent(pick.priorRate)}`;
  }
  if (lens.badge === "mealtime") {
    return lens.chip ?? "此时段";
  }
  return `选择率 ${formatSelectionRatePercent(pick.selectionRate)}`;
}

export function HomeHotPicks({ lens, onPick }: HomeHotPicksProps) {
  if (lens.picks.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 w-full min-w-0 max-w-full">
      <p className="text-xs font-medium text-neutral-500">{lens.title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {lens.picks.map((pick) => (
          <li key={pick.id}>
            <button
              type="button"
              onClick={() => onPick(pickNeedQuery(pick, lens.mealLabel))}
              className="flex w-full min-w-0 items-center justify-between gap-3 rounded-3xl bg-white px-3 py-3 text-left ring-1 ring-black/5 transition hover:ring-black/10 sm:px-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">
                  {pick.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutral-500">
                  {pick.district} · {pick.cuisine} · 人均{pick.avgPrice}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                {badgeText(lens, pick)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
