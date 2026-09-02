import { AppHeader } from "@/components/AppHeader";
import { HomeContent } from "@/components/HomeContent";
import { HomeHowItWorks } from "@/components/HomeHowItWorks";
import { loadHomeLenses } from "@/lib/load-hot-picks";
import type { HomeLens } from "@/lib/hot-picks";

export default async function Home() {
  let lenses: HomeLens[] = [];
  let picksError: string | null = null;
  try {
    lenses = await loadHomeLenses();
  } catch (caught: unknown) {
    picksError = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <div className="relative flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,_#ffe58a_0%,_transparent_58%)]"
      />

      <AppHeader />

      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col items-center px-4 pt-8 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-14">
        <h1 className="mb-6 max-w-full px-1 text-center text-[24px] leading-snug font-semibold tracking-tight text-balance break-words text-foreground sm:mb-8 sm:text-[34px]">
          想吃什么，一句话告诉我
        </h1>
        <HomeContent lenses={lenses} picksError={picksError} />
        <HomeHowItWorks />
      </main>
    </div>
  );
}
