import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse bg-black/[0.07] ${className}`} />;
}

function PageChrome({
  glow = "h-64",
  children,
}: {
  glow?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 ${glow} bg-[radial-gradient(ellipse_at_top,_#ffe58a_0%,_transparent_62%)]`}
      />
      <AppHeader />
      {children}
    </div>
  );
}

/** 首页热门店列表占位 */
export function HomePicksSkeleton() {
  return (
    <section className="mt-10 w-full" aria-busy="true" aria-label="正在准备推荐">
      <Bone className="h-3 w-24 rounded-full" />
      <ul className="mt-3 flex flex-col gap-2">
        {["a", "b", "c"].map((key) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 ring-1 ring-black/5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bone className="h-4 w-28 rounded-full" />
              <Bone className="h-3 w-40 rounded-full" />
            </div>
            <Bone className="h-6 w-16 rounded-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 确认页：需求解析中 */
export function ConfirmSkeleton() {
  return (
    <section className="flex flex-col gap-6 pt-4" aria-busy="true" aria-label="正在理解需求">
      <div>
        <Bone className="h-3 w-16 rounded-full" />
        <Bone className="mt-2 h-5 w-4/5 rounded-full" />
      </div>
      <div>
        <Bone className="h-6 w-40 rounded-lg" />
        <Bone className="mt-2 h-4 w-48 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {["t1", "t2", "t3", "t4", "t5"].map((key) => (
          <Bone key={key} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <Bone className="h-20 w-full rounded-2xl" />
      <Bone className="h-11 w-full rounded-full" />
    </section>
  );
}

function ResultCardSkeleton() {
  return (
    <article className="rounded-3xl bg-white p-4 ring-1 ring-black/5 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-3 w-8 rounded-full" />
          <Bone className="h-5 w-32 rounded-full" />
          <Bone className="h-3 w-40 rounded-full" />
        </div>
        <Bone className="h-6 w-16 rounded-full" />
      </div>
      <Bone className="mt-5 h-3 w-14 rounded-full" />
      <Bone className="mt-2 h-4 w-full rounded-full" />
      <Bone className="mt-2 h-4 w-5/6 rounded-full" />
      <div className="mt-5 flex justify-center rounded-2xl bg-neutral-50 py-4">
        <Bone className="size-[148px] rounded-full" />
      </div>
    </article>
  );
}

/** 结果页：分析与生成推荐中 */
export function ResultsSkeleton({ hint }: { hint?: string }) {
  return (
    <div className="flex w-full flex-col gap-6 pt-2" aria-busy="true" aria-label={hint ?? "正在分析推荐"}>
      <section className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-black/5">
        <div className="flex flex-wrap gap-2">
          {["c1", "c2", "c3", "c4"].map((key) => (
            <Bone key={key} className="h-7 w-16 rounded-full" />
          ))}
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <Bone className="h-3 w-16 rounded-full" />
        <Bone className="mt-3 h-10 w-full rounded-full" />
      </section>
      <div className="flex flex-col gap-4">
        <ResultCardSkeleton />
        <ResultCardSkeleton />
      </div>
      {hint ? <p className="text-center text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

/** 商户视角加载 */
export function InsightSkeleton() {
  return (
    <div className="mt-3 flex flex-col gap-3" aria-busy="true" aria-label="正在提取经营建议">
      <Bone className="h-3 w-20 rounded-full" />
      <Bone className="h-4 w-full rounded-full" />
      <Bone className="h-4 w-4/5 rounded-full" />
      <Bone className="h-3 w-16 rounded-full" />
      <Bone className="h-4 w-full rounded-full" />
      <div className="mt-1 flex justify-center rounded-2xl bg-white/70 py-3">
        <Bone className="size-[120px] rounded-full" />
      </div>
    </div>
  );
}

export function ConfirmPageSkeleton() {
  return (
    <PageChrome>
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col px-4 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
        <ConfirmSkeleton />
      </main>
    </PageChrome>
  );
}

export function ResultsPageSkeleton() {
  return (
    <PageChrome>
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col px-4 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
        <ResultsSkeleton />
      </main>
    </PageChrome>
  );
}

export function ThanksPageSkeleton() {
  return (
    <PageChrome>
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col items-center px-4 pt-8 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="flex w-full flex-col items-center rounded-3xl bg-white px-6 py-10 ring-1 ring-black/5">
          <Bone className="size-12 rounded-full" />
          <Bone className="mt-5 h-6 w-40 rounded-full" />
          <Bone className="mt-3 h-4 w-64 max-w-full rounded-full" />
          <Bone className="mt-2 h-4 w-52 max-w-full rounded-full" />
          <Bone className="mt-6 h-1.5 w-48 rounded-full" />
          <Bone className="mt-7 h-10 w-28 rounded-full" />
        </div>
      </main>
    </PageChrome>
  );
}

export function HomePageSkeleton() {
  return (
    <PageChrome glow="h-[420px]">
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col items-center px-4 pt-8 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-14">
        <Bone className="mb-8 h-8 w-64 max-w-full rounded-full" />
        <Bone className="h-14 w-full rounded-full" />
        <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
          {["p1", "p2", "p3", "p4"].map((key) => (
            <Bone key={key} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <HomePicksSkeleton />
      </main>
    </PageChrome>
  );
}
