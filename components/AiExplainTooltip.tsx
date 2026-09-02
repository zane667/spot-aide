"use client";

import { useEffect, useId, useRef, useState } from "react";

const STEPS = [
  {
    title: "拆你的需求",
    detail: "把一句话拆成菜系、预算、商圈、包间、口味等条件，再拿去对库里的店。",
  },
  {
    title: "算匹配度",
    detail:
      "菜系、预算、位置、设施、口味加权打分；安静 / 包间 / 辣对不上的店不会硬推。选择率只作弱参考，压不过硬需求。",
  },
  {
    title: "读评价写结论",
    detail:
      "对候选店的评价做出品、环境、服务、性价比、场景分析。推荐理由和避坑都要对上评价原文，不够会标明仅供参考。",
  },
] as const;

export function AiExplainTooltip() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointer(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-neutral-600 ring-1 ring-black/10 hover:bg-white"
      >
        <span aria-hidden className="inline-flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-ink">
          i
        </span>
        AI 分析说明
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="AI 分析说明"
          className="absolute top-full right-0 z-30 mt-2 w-[min(20.5rem,calc(100vw-2.5rem))] rounded-2xl bg-white p-4 text-left shadow-[0_12px_32px_rgba(26,26,26,0.12)] ring-1 ring-black/10"
        >
          <p className="text-sm font-semibold tracking-tight text-neutral-800">推荐结论怎么来的</p>
          <p className="mt-1.5 text-xs leading-5 text-neutral-500">
            不是平台官方评分，是参谋按你的条件从评价里推出来的参考。
          </p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {STEPS.map((item, index) => (
              <li key={item.title} className="flex gap-2.5">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-ink">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-xs font-medium text-neutral-800">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-neutral-500">{item.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
