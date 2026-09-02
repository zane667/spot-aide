"use client";

import { analyzeNeeds, recordRecommendSession, streamRecommend, submitChoice } from "@/lib/client-api";
import { getOrCreateRecommendSessionId, loadNeed } from "@/lib/need-session";
import type { AnalyzeCandidate, ChoiceSource, ParseNeed, RecommendResult } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnalyzeProgress } from "./AnalyzeProgress";
import { AppHeader } from "./AppHeader";
import { ResultFramework } from "./ResultFramework";
import { StatusPanel } from "./StatusPanel";

export function ResultsView() {
  const router = useRouter();
  const [needs, setNeeds] = useState<ParseNeed | null>(null);
  const [candidates, setCandidates] = useState<AnalyzeCandidate[]>([]);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [hint, setHint] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rateByMerchantId, setRateByMerchantId] = useState<Record<string, number>>({});
  const [chosenMerchantId, setChosenMerchantId] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);

  useEffect(() => {
    let stored: ParseNeed | null;
    try {
      stored = loadNeed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setEmpty(false);
      setReady(false);
      return;
    }
    if (!stored) {
      router.replace("/");
      return;
    }
    setNeeds(stored);
    setError(null);
    setEmpty(false);
    setReady(false);
    setResult(null);
    setCandidates([]);
    setHint(undefined);
    setSessionId(null);
    setChoiceError(null);

    let cancelled = false;

    analyzeNeeds(stored)
      .then((analyzed) => {
        if (cancelled) {
          return null;
        }
        setCandidates(analyzed.candidates);
        if (analyzed.candidates.length === 0) {
          setEmpty(true);
          setReady(true);
          return null;
        }
        setHint(`正在分析 ${analyzed.candidateCount} 家店的评价…`);
        return streamRecommend(stored, analyzed.candidates).then(async (recommended) => {
          if (recommended.recommendations.length === 0) {
            setEmpty(true);
            setResult(recommended);
            setReady(true);
            return null;
          }
          const shown = recommended.recommendations
            .map((item, index) => {
              const hit = analyzed.candidates.find((row) => row.merchant.name === item.merchant);
              return hit ? { id: hit.merchant.id, rank: index + 1 } : null;
            })
            .filter((item): item is { id: string; rank: number } => item !== null);
          const session = await recordRecommendSession(
            getOrCreateRecommendSessionId(stored),
            stored,
            shown,
          );
          return { recommended, session };
        });
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return;
        }
        setResult(payload.recommended);
        setSessionId(payload.session.sessionId);
        setRateByMerchantId(
          Object.fromEntries(payload.session.merchants.map((row) => [row.id, row.selectionRate])),
        );
        if (payload.session.choice) {
          setChosenMerchantId(payload.session.choice.merchantId);
          setChosenName(payload.session.choice.name);
        }
        setReady(true);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, retry]);

  async function handleChoose(merchantId: string, source: ChoiceSource): Promise<void> {
    if (!sessionId || chosenMerchantId !== null || choiceBusy) {
      return;
    }
    setChoiceBusy(true);
    setChoiceError(null);
    try {
      const payload = await submitChoice(sessionId, merchantId, source);
      setChosenMerchantId(payload.merchantId);
      setChosenName(payload.name);
      setRateByMerchantId((prev) => ({ ...prev, [payload.merchantId]: payload.selectionRate }));
      router.push(`/thanks?shop=${encodeURIComponent(payload.name)}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setChoiceError(message);
      throw caught instanceof Error ? caught : new Error(message);
    } finally {
      setChoiceBusy(false);
    }
  }

  function handleRetry(): void {
    setError(null);
    setEmpty(false);
    setReady(false);
    setRetry((count) => count + 1);
  }

  let body;
  if (error) {
    body = (
      <div className="pt-8">
        <StatusPanel
          kind="error"
          title="没找出店来"
          message={error}
          primary={{ label: "再试一次", onClick: handleRetry }}
          secondary={{ label: "回首页", href: "/" }}
        />
      </div>
    );
  } else if (!ready || !needs) {
    body = <AnalyzeProgress hint={hint} />;
  } else if (empty || !result || result.recommendations.length === 0) {
    body = (
      <div className="pt-8">
        <StatusPanel
          kind="empty"
          title="没有匹配的店"
          message="这句需求在库里对不上。换个菜系、预算或商圈再问一次。"
          primary={{ label: "回首页重说", href: "/" }}
        />
      </div>
    );
  } else {
    body = (
      <ResultFramework
        needs={needs}
        candidates={candidates}
        result={result}
        sessionId={sessionId}
        rateByMerchantId={rateByMerchantId}
        chosenMerchantId={chosenMerchantId}
        chosenName={chosenName}
        choiceBusy={choiceBusy}
        choiceError={choiceError}
        onChoose={handleChoose}
      />
    );
  }

  return (
    <div className="relative flex min-h-full min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_#ffe58a_0%,_transparent_62%)]"
      />
      <AppHeader />
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-xl flex-1 flex-col px-4 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
        {body}
      </main>
    </div>
  );
}
