"use client";

import type { ReactNode } from "react";
import { formatSelectionRatePercent } from "@/lib/selection-rate";

export interface RecommendationCardProps {
  rank: number;
  name: string;
  district?: string;
  cuisine?: string;
  avgPrice?: number;
  matchScore?: number;
  selectionRate?: number;
  reason: string;
  excerpts: string[];
  tasteLabel?: string | null;
  dataInsufficient?: boolean;
  chooseDisabled?: boolean;
  chosen?: boolean;
  onChoose?: () => void;
  children?: ReactNode;
}

export function RecommendationCard({
  rank,
  name,
  district,
  cuisine,
  avgPrice,
  matchScore,
  selectionRate,
  reason,
  excerpts,
  tasteLabel,
  dataInsufficient = false,
  chooseDisabled = false,
  chosen = false,
  onChoose,
  children,
}: RecommendationCardProps) {
  const meta = [district, cuisine, avgPrice !== undefined ? `人均${avgPrice}` : null].filter(
    (item): item is string => Boolean(item),
  );

  return (
    <article className="min-w-0 overflow-hidden rounded-3xl bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.06)] ring-1 ring-black/5 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-neutral-400">#{rank}</p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight break-words sm:text-lg">{name}</h2>
          {meta.length > 0 ? (
            <p className="mt-1 text-sm break-words text-neutral-500">{meta.join(" · ")}</p>
          ) : null}
        </div>
        {matchScore !== undefined || selectionRate !== undefined ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {matchScore !== undefined ? (
              <span className="rounded-full bg-brand px-2 py-1 text-[11px] font-semibold text-brand-ink sm:px-2.5 sm:text-xs">
                匹配 {matchScore}
              </span>
            ) : null}
            {selectionRate !== undefined ? (
              <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600 sm:px-2.5 sm:text-xs">
                选择率 {formatSelectionRatePercent(selectionRate)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {dataInsufficient ? (
        <p className="mt-3 text-xs text-amber-700">评价数据不足，推荐结果仅供参考</p>
      ) : null}

      <section className="mt-4">
        <p className="text-xs font-medium text-neutral-500">推荐理由</p>
        <p className="mt-1 text-sm leading-6 break-words text-neutral-800">{reason}</p>
        {tasteLabel ? <p className="mt-2 text-xs text-neutral-500">{tasteLabel}</p> : null}
      </section>

      {excerpts.length > 0 ? (
        <section className="mt-4 flex flex-col gap-2">
          <p className="text-xs font-medium text-neutral-500">评价原文</p>
          {excerpts.map((excerpt) => (
            <blockquote
              key={excerpt}
              className="border-l-2 border-brand pl-3 text-sm leading-6 break-words text-neutral-600"
            >
              「{excerpt}」
            </blockquote>
          ))}
        </section>
      ) : (
        <p className="mt-3 text-xs text-neutral-400">暂无评价原文可引用</p>
      )}

      {onChoose ? (
        <button
          type="button"
          disabled={chooseDisabled}
          onClick={onChoose}
          className="mt-4 min-h-10 w-full rounded-full px-4 py-2 text-sm font-medium text-brand-ink ring-1 ring-black/10 hover:bg-brand/40 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {chosen ? "就是这家" : "我就去这家"}
        </button>
      ) : null}

      {children}
    </article>
  );
}
