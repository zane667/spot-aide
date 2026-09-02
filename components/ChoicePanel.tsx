"use client";

import { searchMerchants, type MerchantSearchHit } from "@/lib/client-api";
import { formatSelectionRatePercent } from "@/lib/selection-rate";
import { useEffect, useState } from "react";
import { StatusPanel } from "./StatusPanel";

interface ChoicePanelProps {
  sessionId: string | null;
  disabled: boolean;
  chosenName: string | null;
  onChoose: (merchantId: string) => Promise<void>;
}

export function ChoicePanel({ sessionId, disabled, chosenName, onChoose }: ChoicePanelProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MerchantSearchHit[]>([]);
  const [picked, setPicked] = useState<MerchantSearchHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);

  useEffect(() => {
    const keyword = query.trim();
    if (picked && picked.name === keyword) {
      return;
    }
    if (keyword.length === 0) {
      setHits([]);
      setSearching(false);
      setSearchedQuery("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      setHits([]);
      searchMerchants(keyword)
        .then((rows) => {
          if (!cancelled) {
            setHits(rows);
            setSearchedQuery(keyword);
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setHits([]);
            setSearchedQuery(keyword);
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, picked, searchNonce]);

  if (!sessionId) {
    return (
      <StatusPanel
        compact
        kind="empty"
        title="还不能记去向"
        message="本轮推荐场次没建起来，刷新结果页后再选店。"
      />
    );
  }

  if (chosenName) {
    return (
      <section className="rounded-3xl bg-white px-4 py-4 shadow-[0_8px_28px_rgba(26,26,26,0.06)] ring-1 ring-black/5 sm:px-5">
        <p className="text-xs font-medium text-neutral-500">吃完了</p>
        <p className="mt-1 text-sm leading-6 break-words text-neutral-800">
          已记下：你去了「{chosenName}」。这家店的用户选择率已更新。
        </p>
      </section>
    );
  }

  async function handleConfirm(): Promise<void> {
    if (!picked || disabled || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onChoose(picked.id);
    } catch {
      // handleChoose 已把失败写入 choiceError，这里只避免未处理的 Promise
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl bg-white px-4 py-4 shadow-[0_8px_28px_rgba(26,26,26,0.06)] ring-1 ring-black/5 sm:px-5">
      <p className="text-xs font-medium text-neutral-500">吃完了？告诉参谋你去了哪</p>
      <p className="mt-1 text-sm leading-6 text-neutral-700">
        点卡片上的「我就去这家」，或搜索库里已有的店名。本轮只能记一家。
      </p>

      <label className="mt-3 block">
        <span className="sr-only">搜索库内商家</span>
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setPicked(null);
            setQuery(event.target.value);
            setError(null);
          }}
          placeholder="搜索库内店名，例如 巷口火锅"
          className="w-full rounded-2xl bg-neutral-50 px-4 py-2.5 text-base outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-brand sm:text-sm"
        />
      </label>

      {searching ? (
        <ul className="mt-2 flex flex-col gap-1" aria-busy="true" aria-label="搜索中">
          {["s1", "s2"].map((key) => (
            <li key={key} className="flex items-center justify-between px-4 py-2.5">
              <span className="h-3 w-28 animate-pulse rounded-full bg-black/[0.07]" />
              <span className="h-3 w-12 animate-pulse rounded-full bg-black/[0.07]" />
            </li>
          ))}
        </ul>
      ) : null}

      {hits.length > 0 && !picked ? (
        <ul className="mt-2 max-h-48 overflow-auto rounded-2xl ring-1 ring-black/5">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  setPicked(hit);
                  setQuery(hit.name);
                  setHits([]);
                }}
                className="flex w-full min-w-0 items-start justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-neutral-50 sm:items-center sm:px-4"
              >
                <span className="min-w-0">
                  <span className="block break-words font-medium">{hit.name}</span>
                  <span className="mt-0.5 block text-xs text-neutral-400">
                    {hit.district} · {hit.cuisine}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  选择率 {formatSelectionRatePercent(hit.selectionRate)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query.trim() &&
      searchedQuery === query.trim() &&
      !searching &&
      hits.length === 0 &&
      !picked &&
      !error ? (
        <div className="mt-2">
          <StatusPanel
            compact
            kind="empty"
            title="库里没有这家店"
            message="只能选已有商家。换个店名再搜，或点卡片上的「我就去这家」。"
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-2">
          <StatusPanel
            compact
            kind="error"
            title="店名搜索失败"
            message={error}
            primary={
              query.trim()
                ? { label: "再搜一次", onClick: () => setSearchNonce((count) => count + 1) }
                : undefined
            }
          />
        </div>
      ) : null}

      {picked ? (
        <p className="mt-2 text-xs break-words text-neutral-500">
          已选「{picked.name}」· 当前选择率 {formatSelectionRatePercent(picked.selectionRate)}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!picked || disabled || submitting}
        onClick={() => {
          void handleConfirm();
        }}
        className="mt-3 min-h-11 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {submitting ? "正在记下…" : "确认去这家"}
      </button>
    </section>
  );
}
