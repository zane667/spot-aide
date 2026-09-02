"use client";

import { StatusPanel } from "@/components/StatusPanel";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-[#fff8eb] px-4 py-10 font-sans text-[#1a1a1a]">
        <main className="mx-auto w-full max-w-xl">
          <StatusPanel
            kind="error"
            title="探店参谋暂时不可用"
            message={error.message || "页面加载失败，请再试一次。"}
            primary={{ label: "再试一次", onClick: reset }}
          />
        </main>
      </body>
    </html>
  );
}
