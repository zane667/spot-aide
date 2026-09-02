import { AiExplainTooltip } from "@/components/AiExplainTooltip";
import { ChoicePanel } from "@/components/ChoicePanel";
import { FollowUpChat } from "@/components/FollowUpChat";
import { InsightRadar } from "@/components/InsightRadar";
import { MerchantInsightToggle } from "@/components/MerchantInsightToggle";
import { RecommendationCard } from "@/components/RecommendationCard";
import { StatusPanel } from "@/components/StatusPanel";
import { NEED_TAG_FIELDS, tagValue } from "@/lib/need-tags";
import type { AnalyzeCandidate, ParseNeed, RecommendResult } from "@/lib/schemas";

function tasteFitLabel(needs: ParseNeed, candidate: AnalyzeCandidate | undefined): string | null {
  if (!needs.taste) {
    return null;
  }
  const score = candidate?.match.dimensions.find((item) => item.key === "taste")?.score ?? null;
  if (score !== null && score >= 0.7) {
    return `辣度：评价支持「${needs.taste}」`;
  }
  if (score !== null && score <= 0.05) {
    return `辣度：与「${needs.taste}」冲突`;
  }
  return "辣度：该维度数据不足，建议实地体验确认";
}

interface ResultFrameworkProps {
  needs: ParseNeed;
  candidates: AnalyzeCandidate[];
  result: RecommendResult;
  sessionId: string | null;
  rateByMerchantId: Record<string, number>;
  chosenMerchantId: string | null;
  chosenName: string | null;
  choiceBusy: boolean;
  choiceError: string | null;
  onChoose: (merchantId: string, source: "card" | "search") => Promise<void>;
}

export function ResultFramework({
  needs,
  candidates,
  result,
  sessionId,
  rateByMerchantId,
  chosenMerchantId,
  chosenName,
  choiceBusy,
  choiceError,
  onChoose,
}: ResultFrameworkProps) {
  const tags = NEED_TAG_FIELDS.filter((field) => tagValue(needs, field.key) !== null);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="min-w-0 text-lg font-semibold tracking-tight">为你找的店</h1>
        <AiExplainTooltip />
      </div>

      {tags.length === 0 ? (
        <StatusPanel
          compact
          kind="empty"
          title="没有可用条件"
          message="解析结果里没有标签。可以回上一页补上，或先看下面的推荐。"
        />
      ) : (
        <section className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-black/5">
          <p className="mb-2 text-xs text-neutral-500">按这些条件找的店</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((field) => {
              const value = tagValue(needs, field.key);
              if (value === null) {
                return null;
              }
              return (
                <span
                  key={field.key}
                  className="rounded-full bg-brand/70 px-3 py-1 text-xs font-medium text-brand-ink"
                >
                  {field.format(value)}
                </span>
              );
            })}
          </div>
        </section>
      )}

      <FollowUpChat needs={needs} candidates={candidates} result={result} />

      {result.recommendations.length === 0 ? (
        <StatusPanel
          kind="empty"
          title="没有推荐卡片"
          message="模型没有给出店名。回首页换一句再问。"
          primary={{ label: "回首页", href: "/" }}
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {result.recommendations.map((item, index) => {
            const candidate = candidates.find((row) => row.merchant.name === item.merchant);
            return (
            <li key={`${item.merchant}-${index}`}>
              <RecommendationCard
                rank={index + 1}
                name={item.merchant}
                district={candidate?.merchant.district}
                cuisine={candidate?.merchant.cuisine}
                avgPrice={candidate?.merchant.avgPrice}
                matchScore={candidate?.match.total}
                selectionRate={
                  candidate
                    ? (rateByMerchantId[candidate.merchant.id] ?? candidate.selectionRate)
                    : undefined
                }
                reason={item.reason}
                excerpts={candidate?.reviewExcerpts ?? []}
                tasteLabel={tasteFitLabel(needs, candidate)}
                dataInsufficient={candidate?.dataInsufficient}
                chooseDisabled={choiceBusy || chosenMerchantId !== null || !sessionId}
                chosen={Boolean(candidate && candidate.merchant.id === chosenMerchantId)}
                onChoose={
                  candidate && sessionId
                    ? () => {
                        void onChoose(candidate.merchant.id, "card").catch(() => undefined);
                      }
                    : undefined
                }
              >
                <div className="mt-5">
                  <p className="mb-2 text-[11px] text-neutral-400">五维来自评价语义，不是官方星级</p>
                  <InsightRadar scores={candidate?.analysis} />
                </div>

                <div className="mt-5 rounded-2xl bg-[#fff6d6] px-4 py-3">
                  <p className="text-xs font-medium text-neutral-500">避坑提醒</p>
                  <p className="mt-1 text-sm leading-6 break-words text-neutral-800">{item.notes}</p>
                </div>
                {candidate ? <MerchantInsightToggle merchantId={candidate.merchant.id} /> : null}
              </RecommendationCard>
            </li>
            );
          })}
        </ol>
      )}

      {result.gap ? (
        <section className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 break-words text-neutral-600 ring-1 ring-black/5">
          <p className="text-xs font-medium text-neutral-500">差距说明</p>
          <p className="mt-1">{result.gap}</p>
        </section>
      ) : null}

      <ChoicePanel
        sessionId={sessionId}
        disabled={choiceBusy || chosenMerchantId !== null}
        chosenName={chosenName}
        onChoose={(merchantId) => onChoose(merchantId, "search")}
      />
      {choiceError ? (
        <StatusPanel
          compact
          kind="error"
          title="没记下你去了哪"
          message={choiceError}
        />
      ) : null}
    </div>
  );
}
