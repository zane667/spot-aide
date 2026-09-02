"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";

const REDIRECT_SECONDS = 4;

export function ThanksView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawName = (searchParams.get("shop") ?? "").trim();
  const shopName = rawName.length > 40 ? `${rawName.slice(0, 40)}…` : rawName;
  const [left, setLeft] = useState(REDIRECT_SECONDS);
  const [barWidth, setBarWidth] = useState("100%");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setBarWidth("0%"));
    const started = Date.now();
    const tick = window.setInterval(() => {
      const remain = Math.max(
        0,
        Math.ceil(REDIRECT_SECONDS - (Date.now() - started) / 1000),
      );
      setLeft(remain);
    }, 200);
    const go = window.setTimeout(() => {
      router.replace("/");
    }, REDIRECT_SECONDS * 1000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [router]);

  return (
    <div className="relative flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_#ffe58a_0%,_transparent_62%)]"
      />
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col items-center px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-8 sm:px-5">
        <section className="flex w-full min-w-0 flex-col items-center rounded-3xl bg-white px-4 py-8 text-center shadow-[0_8px_28px_rgba(26,26,26,0.06)] ring-1 ring-black/5 sm:px-6 sm:py-10">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-brand-ink">
            探
          </span>
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-balance sm:text-[26px]">
            谢谢你告诉参谋
          </h1>
          {shopName ? (
            <p className="mt-3 max-w-sm text-sm leading-6 break-words text-neutral-600">
              已记下你去了「{shopName}」，这家店的用户选择率会据此更新。感谢你参与这次探店体验。
            </p>
          ) : (
            <p className="mt-3 max-w-sm text-sm leading-6 break-words text-neutral-600">
              感谢你参与这次探店体验，你的选择会帮参谋把推荐做得更准。
            </p>
          )}
          <p className="mt-5 text-xs text-neutral-400">{left} 秒后回到首页</p>
          <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-brand transition-[width] ease-linear"
              style={{ width: barWidth, transitionDuration: `${REDIRECT_SECONDS}s` }}
            />
          </div>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-7 min-h-11 w-full max-w-xs rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink transition hover:brightness-95 sm:w-auto"
          >
            立即回首页
          </button>
        </section>
      </main>
    </div>
  );
}
