"use client";

import { InsightRadar } from "@/components/InsightRadar";
import { fetchMerchantInsight, type MerchantInsightPayload } from "@/lib/client-api";
import { useState } from "react";
import { InsightSkeleton } from "./Skeleton";
import { StatusPanel } from "./StatusPanel";

interface MerchantInsightToggleProps {
  merchantId: string;
}

function lineText(items: string[] | string | undefined, fallback: string): string {
  if (Array.isArray(items)) {
    const joined = items.map((item) => item.trim()).filter((item) => item !== "").join("、");
    return joined === "" ? fallback : joined;
  }
  if (typeof items === "string" && items.trim() !== "") {
    return items.trim();
  }
  return fallback;
}

export function MerchantInsightToggle({ merchantId }: MerchantInsightToggleProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MerchantInsightPayload | null>(null);

  async function loadInsight(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const insight = await fetchMerchantInsight(merchantId);
      setData(insight);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(): Promise<void> {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (data || loading) {
      return;
    }
    await loadInsight();
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          void handleToggle();
        }}
        className="min-h-9 rounded-full px-3 py-2 text-xs font-medium text-neutral-700 ring-1 ring-black/10 hover:bg-neutral-50"
      >
        {open ? "回到顾客视角" : "切换商户视角"}
      </button>

      {open ? (
        <div className="mt-3 rounded-2xl bg-neutral-50 px-4 py-3">
          <p className="text-xs font-medium text-neutral-500">经营洞察 · CatPaw</p>
          {loading ? <InsightSkeleton /> : null}
          {!loading && error ? (
            <div className="mt-3">
              <StatusPanel
                compact
                kind="error"
                title="洞察没生成"
                message={error}
                primary={{ label: "再试一次", onClick: () => void loadInsight() }}
              />
            </div>
          ) : null}
          {!loading && !error && data ? (
            <div className="mt-3 flex min-w-0 flex-col gap-3 text-sm leading-6 break-words text-neutral-800">
              <p>
                <span className="text-xs text-neutral-500">顾客最在意</span>
                <br />
                {lineText(data.view.care_about, "暂时没归纳出来")}
              </p>
              <p>
                <span className="text-xs text-neutral-500">差评集中在</span>
                <br />
                {lineText(data.view.complaint_focus, "暂时没归纳出来")}
              </p>
              <p>
                <span className="text-xs text-neutral-500">差异化优势</span>
                <br />
                {lineText(data.view.advantage, "暂时没归纳出来")}
              </p>
              <p>
                <span className="text-xs text-neutral-500">需要警惕</span>
                <br />
                {lineText(data.view.watch_out, "暂时没归纳出来")}
              </p>
              <InsightRadar compact scores={data.analysis} />
            </div>
          ) : null}
          {!loading && !error && !data ? (
            <div className="mt-3">
              <StatusPanel
                compact
                kind="empty"
                title="没有经营洞察"
                message="这家店还没有可展示的商户视角内容。"
                primary={{ label: "再试一次", onClick: () => void loadInsight() }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
