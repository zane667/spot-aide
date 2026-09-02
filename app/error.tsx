"use client";

import { AppHeader } from "@/components/AppHeader";
import { StatusPanel } from "@/components/StatusPanel";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="relative flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_#ffe58a_0%,_transparent_62%)]"
      />
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col px-4 pt-8 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
        <StatusPanel
          kind="error"
          title="这一页没打开"
          message={error.message || "出了一点问题，请再试一次。"}
          primary={{ label: "再试一次", onClick: reset }}
          secondary={{ label: "回首页", href: "/" }}
        />
      </main>
    </div>
  );
}
