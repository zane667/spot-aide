/** Beta 平滑的伪计数，避免 0 曝光时选择率剧烈跳动 */
export const PRIOR_PSEUDO_COUNT = 10;

/** 种子评价里的负面标签，用于先验里的负向占比 */
export const NEGATIVE_TAG_NAMES = new Set([
  "等位久",
  "分量少",
  "服务差",
  "太吵",
  "性价比低",
  "停车难",
]);

export interface ReviewPriorInput {
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  tagNames: string[];
}

export interface MerchantRateInput {
  priorRate: number;
  impressions: number;
  selections: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertFiniteRate(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 不是有限数字：${value}`);
  }
}

/**
 * 用评价均分、好评占比、负面标签占比算出先验选择率 p0。
 * 评价不足 5 条时再打 0.7 折。
 */
export function computePriorRate(reviews: ReviewPriorInput[]): number {
  if (reviews.length === 0) {
    return clamp(0.35 * 0.7, 0.05, 0.95);
  }

  const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  if (avgRating < 1 || avgRating > 5) {
    throw new Error(`评价均分超出 1–5：${avgRating}`);
  }

  const positiveShare =
    reviews.filter((review) => review.sentiment === "positive").length / reviews.length;
  const allTags = reviews.flatMap((review) => review.tagNames);
  const negativeTagShare =
    allTags.length === 0
      ? 0
      : allTags.filter((tag) => NEGATIVE_TAG_NAMES.has(tag)).length / allTags.length;

  let prior =
    0.45 * (avgRating / 5) + 0.35 * positiveShare + 0.2 * (1 - negativeTagShare);
  if (reviews.length < 5) {
    prior *= 0.7;
  }
  return clamp(prior, 0.05, 0.95);
}

/** 展示用选择率：(selections + p0 * 10) / (impressions + 10)，不落库 */
export function smoothedSelectionRate(input: MerchantRateInput): number {
  assertFiniteRate(input.priorRate, "priorRate");
  if (input.impressions < 0 || input.selections < 0) {
    throw new Error(
      `曝光/选择次数不能为负：impressions=${input.impressions} selections=${input.selections}`,
    );
  }
  const prior = clamp(input.priorRate, 0, 1);
  const raw =
    (input.selections + prior * PRIOR_PSEUDO_COUNT) /
    (input.impressions + PRIOR_PSEUDO_COUNT);
  return clamp(raw, 0, 1);
}

export function formatSelectionRatePercent(rate: number): string {
  assertFiniteRate(rate, "selectionRate");
  return `${Math.round(clamp(rate, 0, 1) * 100)}%`;
}

export function priorRateFromMerchantReviews(
  reviews: Array<{
    rating: number;
    sentiment: string;
    tags: Array<{ name: string }>;
  }>,
): number {
  return computePriorRate(
    reviews.map((review) => {
      if (
        review.sentiment !== "positive" &&
        review.sentiment !== "neutral" &&
        review.sentiment !== "negative"
      ) {
        throw new Error(`未知情感极性：${review.sentiment}`);
      }
      return {
        rating: review.rating,
        sentiment: review.sentiment,
        tagNames: review.tags.map((tag) => tag.name),
      };
    }),
  );
}
