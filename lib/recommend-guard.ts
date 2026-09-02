import type { AnalyzeCandidate, ParseNeed } from "./schemas.ts";

const HARD_MISS_SCORE = 0.05;
/** 要安静时，分析文本里出现这些就视为冲突（含单字「吵」、油烟） */
const NOISY_PATTERN = /太吵|嘈杂|热闹|吵闹|油烟|(?<![不])吵/;
/** 要安静时环境分必须达到该值，否则剔除 */
const QUIET_ENVIRONMENT_MIN = 7;
const MILD_PATTERN = /不辣|清淡|少辣/;
const SPICY_PATTERN = /香辣|麻辣|很辣|太辣|重辣|(?<![不])辣/;

function dimensionScore(candidate: AnalyzeCandidate, key: string): number | null {
  const row = candidate.match.dimensions.find((item) => item.key === key);
  return row?.score ?? null;
}

function analysisText(candidate: AnalyzeCandidate): string {
  const analysis = candidate.analysis;
  if (!analysis) {
    return "";
  }
  return [
    ...analysis.risk_signals,
    analysis.avoid_if,
    analysis.best_for,
    ...analysis.top_tags,
  ].join(" ");
}

/** 硬需求冲突：有则不应进入推荐列表，只写 gap */
export function hardNeedViolations(
  needs: ParseNeed,
  candidate: AnalyzeCandidate,
): string[] {
  const violations: string[] = [];
  const text = analysisText(candidate);

  if (
    needs.atmosphere &&
    (needs.atmosphere.includes("安静") || needs.atmosphere.includes("私密"))
  ) {
    const score = dimensionScore(candidate, "atmosphere");
    if (score !== null && score <= HARD_MISS_SCORE) {
      violations.push(`氛围「${needs.atmosphere}」标签未命中`);
    }
    if (candidate.analysis && candidate.analysis.environment < QUIET_ENVIRONMENT_MIN) {
      violations.push(
        `环境分 ${candidate.analysis.environment}，低于 ${QUIET_ENVIRONMENT_MIN}，难满足安静`,
      );
    }
    if (NOISY_PATTERN.test(text)) {
      violations.push("评价分析提到吵/油烟/热闹，与安静冲突");
    }
  }

  if (needs.facility?.includes("包间")) {
    const score = dimensionScore(candidate, "facility");
    if (score !== null && score <= HARD_MISS_SCORE) {
      violations.push("设施「包间」标签未命中");
    }
  }

  if (needs.cuisine) {
    const score = dimensionScore(candidate, "cuisine");
    if (score !== null && score <= 0.2) {
      violations.push(`菜系要${needs.cuisine}，店是${candidate.merchant.cuisine}`);
    }
  }

  if (needs.taste) {
    const mildWanted = /不辣|不要辣|少辣|清淡/.test(needs.taste);
    const spicyWanted = !mildWanted && /辣|麻辣|香辣/.test(needs.taste);
    const score = dimensionScore(candidate, "taste");
    if (score !== null && score <= HARD_MISS_SCORE) {
      violations.push(`口味「${needs.taste}」未命中或冲突`);
    }
    if (spicyWanted && MILD_PATTERN.test(text)) {
      violations.push("评价分析偏清淡/不辣，与要辣冲突");
    }
    if (mildWanted && SPICY_PATTERN.test(text)) {
      violations.push("评价分析偏辣，与不辣/清淡冲突");
    }
  }

  return violations;
}

export interface GuardedAnalyses {
  recommendable: AnalyzeCandidate[];
  ineligible: Array<{ candidate: AnalyzeCandidate; violations: string[] }>;
  usedFallback: boolean;
}

/** 只把满足硬需求的店交给推荐模型；全军覆没时留匹配最高的 1 家兜底 */
export function pickRecommendable(
  needs: ParseNeed,
  candidates: AnalyzeCandidate[],
): GuardedAnalyses {
  const ineligible: GuardedAnalyses["ineligible"] = [];
  const recommendable: AnalyzeCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.analysis === null) {
      ineligible.push({
        candidate,
        violations: ["缺少评价分析"],
      });
      continue;
    }
    const violations = hardNeedViolations(needs, candidate);
    if (violations.length > 0) {
      ineligible.push({ candidate, violations });
      continue;
    }
    recommendable.push(candidate);
  }

  if (recommendable.length > 0) {
    return { recommendable, ineligible, usedFallback: false };
  }

  const fallback = candidates.find((item) => item.analysis !== null);
  if (!fallback) {
    throw new Error("候选商家均缺少评价分析，无法生成推荐");
  }
  return {
    recommendable: [fallback],
    ineligible,
    usedFallback: true,
  };
}

export function summarizeCandidate(candidate: AnalyzeCandidate): Record<string, unknown> {
  return {
    name: candidate.merchant.name,
    cuisine: candidate.merchant.cuisine,
    avgPrice: candidate.merchant.avgPrice,
    district: candidate.merchant.district,
    address: candidate.merchant.address,
    match_score: candidate.match.total,
    taste_match:
      candidate.match.dimensions.find((item) => item.key === "taste")?.reason ?? null,
    data_insufficient: candidate.dataInsufficient,
    analysis: candidate.analysis,
    analysis_error: candidate.error?.message ?? null,
  };
}
