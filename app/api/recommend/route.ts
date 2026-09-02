import { fail, failFromUnknown, formatZodIssues } from "@/lib/api-error";
import { chatSSE } from "@/lib/deepseek";
import { FOLLOWUP_SYSTEM, RECOMMEND_SYSTEM, fillPrompt } from "@/lib/prompts";
import { pickRecommendable, summarizeCandidate } from "@/lib/recommend-guard";
import {
  recommendRequestSchema,
  type AnalyzeCandidate,
  type ChatTurn,
  type ParseNeed,
  type RecommendResult,
} from "@/lib/schemas";

export const runtime = "nodejs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** 把候选商家压成 Prompt 里的 {merchant_analyses}，硬需求冲突店只留店名和原因 */
function formatMerchantAnalyses(needs: ParseNeed, candidates: AnalyzeCandidate[]): string {
  const guarded = pickRecommendable(needs, candidates);
  return JSON.stringify({
    recommendable: guarded.recommendable.map(summarizeCandidate),
    ineligible: guarded.ineligible.map((item) => ({
      name: item.candidate.merchant.name,
      hard_violations: item.violations,
    })),
    used_fallback: guarded.usedFallback,
    max_recommendations: Math.min(3, guarded.recommendable.length),
  });
}

function followupMessages(
  needs: ParseNeed,
  candidates: AnalyzeCandidate[],
  previous: RecommendResult | undefined,
  turns: ChatTurn[],
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("追问的最后一条必须是用户消息");
  }
  return [
    {
      role: "system",
      content: fillPrompt(FOLLOWUP_SYSTEM, {
        user_needs: JSON.stringify(needs),
        previous_recommendations: JSON.stringify(previous ?? null),
        merchant_analyses: formatMerchantAnalyses(needs, candidates),
      }),
    },
    ...turns,
  ];
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return fail(
      "INVALID_JSON",
      error instanceof Error ? `请求体不是合法 JSON：${error.message}` : "请求体不是合法 JSON",
      400,
    );
  }

  const input = recommendRequestSchema.safeParse(body);
  if (!input.success) {
    return fail("INVALID_INPUT", formatZodIssues(input.error), 400);
  }

  const analyzable = input.data.candidates.filter((item) => item.analysis !== null);
  if (analyzable.length === 0) {
    return fail("INVALID_INPUT", "候选商家均缺少评价分析，无法生成推荐", 400);
  }

  const turns = input.data.messages ?? [];
  const isFollowup = turns.length > 0;
  if (isFollowup) {
    const last = turns[turns.length - 1];
    if (!last || last.role !== "user") {
      return fail("INVALID_INPUT", "追问的最后一条必须是用户消息", 400);
    }
  }

  try {
    const stream = isFollowup
      ? await chatSSE(
          followupMessages(
            input.data.needs,
            input.data.candidates,
            input.data.previous,
            turns,
          ),
        )
      : await chatSSE([
          {
            role: "system",
            content: fillPrompt(RECOMMEND_SYSTEM, {
              user_needs: JSON.stringify(input.data.needs),
              merchant_analyses: formatMerchantAnalyses(input.data.needs, input.data.candidates),
            }),
          },
          {
            role: "user",
            content: "请严格按 System Prompt 输出 JSON，不要输出其它文字。",
          },
        ]);

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return failFromUnknown(error);
  }
}
