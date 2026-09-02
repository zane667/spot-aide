import Link from "next/link";

export function AppHeader() {
  return (
    <header className="relative z-10 mx-auto flex w-full min-w-0 max-w-3xl items-center justify-between gap-3 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:py-5">
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink">
          探
        </span>
        <span className="truncate text-[15px] font-semibold tracking-tight">探店参谋</span>
      </Link>
      <p className="hidden shrink-0 text-xs text-neutral-500 min-[380px]:block">基于评价的探店决策</p>
    </header>
  );
}
