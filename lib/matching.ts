import type { ParseNeed } from "./schemas.ts";

/** 需求维度合计 1；选择率是弱加权 0.06，归一化后不能压过菜系/包间/辣 */
export const MATCH_WEIGHTS = {
  cuisine: 0.28,
  budget: 0.22,
  location: 0.13,
  atmosphere: 0.08,
  facility: 0.12,
  scene: 0.05,
  taste: 0.12,
  selectionRate: 0.06,
} as const;

export type MatchDimension = keyof typeof MATCH_WEIGHTS;

export interface MerchantSnapshot {
  id: string;
  name: string;
  cuisine: string;
  avgPrice: number;
  address: string;
  district: string;
  tagNames: string[];
  /** 平滑后的用户选择率 0–1；缺省则不参与加权 */
  selectionRate?: number | null;
}

export interface DimensionScore {
  key: MatchDimension;
  weight: number;
  /** 0–1；null 表示用户未提该维度，不参与加权 */
  score: number | null;
  reason: string;
}

export interface MatchScore {
  total: number;
  dimensions: DimensionScore[];
}

export interface RankedMerchant extends MatchScore {
  merchant: MerchantSnapshot;
}

export interface BudgetRange {
  min: number;
  max: number;
}

const ZH_CUISINE = new Set(["粤菜", "川菜", "湘菜", "本帮菜", "杭帮菜", "东北菜", "家常菜"]);

/** 硬约束未命中：几乎不贡献分数，避免软扣分后仍挤进 Top 5 */
const HARD_MISS_SCORE = 0.05;
/** 标签与硬需求相反（如要安静却标了热闹） */
const HARD_CONFLICT_SCORE = 0.02;

function includesLoose(haystack: string, needle: string): boolean {
  const a = haystack.trim().toLowerCase();
  const b = needle.trim().toLowerCase();
  if (a === "" || b === "") {
    return false;
  }
  return a.includes(b) || b.includes(a);
}

function hasTag(tags: string[], keywords: string[]): boolean {
  return tags.some((tag) => keywords.some((keyword) => includesLoose(tag, keyword)));
}

/** 把 "200" / "150-200" / "500以上" 解析成区间 */
export function parseBudgetRange(budget: string | null): BudgetRange | null {
  if (!budget) {
    return null;
  }
  const range = budget.match(/(\d+(?:\.\d+)?)\s*[-~～到至]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      throw new Error(`无法解析预算区间：${budget}`);
    }
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }
  const above = budget.match(/(\d+(?:\.\d+)?)\s*(以上|起|\+)/);
  if (above) {
    return { min: Number(above[1]), max: Number.POSITIVE_INFINITY };
  }
  const below = budget.match(/(\d+(?:\.\d+)?)\s*(以下|以内|内)/);
  if (below) {
    return { min: 0, max: Number(below[1]) };
  }
  const single = budget.match(/(\d+(?:\.\d+)?)/);
  if (!single) {
    return null;
  }
  const mid = Number(single[1]);
  return { min: mid * 0.8, max: mid * 1.2 };
}

function scoreCuisine(need: string | null, cuisine: string): DimensionScore {
  const weight = MATCH_WEIGHTS.cuisine;
  if (!need) {
    return { key: "cuisine", weight, score: null, reason: "用户未指定菜系" };
  }
  if (includesLoose(cuisine, need)) {
    return { key: "cuisine", weight, score: 1, reason: `菜系命中「${cuisine}」` };
  }
  if (need === "中餐" && ZH_CUISINE.has(cuisine)) {
    return { key: "cuisine", weight, score: 0.55, reason: `${cuisine} 可归入中餐` };
  }
  return { key: "cuisine", weight, score: 0.12, reason: `菜系不匹配（要${need}，店是${cuisine}）` };
}

function scoreBudget(need: string | null, avgPrice: number): DimensionScore {
  const weight = MATCH_WEIGHTS.budget;
  if (!need) {
    return { key: "budget", weight, score: null, reason: "用户未指定预算" };
  }
  const range = parseBudgetRange(need);
  if (!range) {
    return { key: "budget", weight, score: 0.4, reason: `预算「${need}」无法解析为数字` };
  }
  if (avgPrice >= range.min && avgPrice <= range.max) {
    return { key: "budget", weight, score: 1, reason: `人均 ${avgPrice} 落在预算内` };
  }
  const span = Number.isFinite(range.max)
    ? Math.max(range.max - range.min, 1)
    : Math.max(range.min, 1);
  const dist =
    avgPrice < range.min ? range.min - avgPrice : avgPrice - (Number.isFinite(range.max) ? range.max : range.min);
  const ratio = dist / span;
  if (ratio <= 0.2) {
    return { key: "budget", weight, score: 0.65, reason: `人均 ${avgPrice} 略超预算` };
  }
  if (ratio <= 0.5) {
    return { key: "budget", weight, score: 0.3, reason: `人均 ${avgPrice} 明显偏离预算` };
  }
  return { key: "budget", weight, score: 0.08, reason: `人均 ${avgPrice} 远离预算` };
}

function scoreLocation(need: string | null, merchant: MerchantSnapshot): DimensionScore {
  const weight = MATCH_WEIGHTS.location;
  if (!need) {
    return { key: "location", weight, score: null, reason: "用户未指定位置" };
  }
  if (includesLoose(merchant.district, need) || includesLoose(merchant.address, need)) {
    return { key: "location", weight, score: 1, reason: `位置命中「${merchant.district}」` };
  }
  return { key: "location", weight, score: 0.18, reason: `位置不匹配（要${need}，店在${merchant.district}）` };
}

function scoreAtmosphere(need: string | null, tags: string[]): DimensionScore {
  const weight = MATCH_WEIGHTS.atmosphere;
  if (!need) {
    return { key: "atmosphere", weight, score: null, reason: "用户未指定氛围" };
  }
  const keywords = [need];
  if (need.includes("安静")) {
    keywords.push("安静");
  }
  if (need.includes("热闹")) {
    keywords.push("热闹", "人多");
  }
  if (need.includes("浪漫") || need.includes("约会")) {
    keywords.push("约会", "浪漫");
  }
  if (need.includes("私密")) {
    keywords.push("包间", "私密");
  }
  if (hasTag(tags, keywords)) {
    return { key: "atmosphere", weight, score: 1, reason: `评价标签支持氛围「${need}」` };
  }
  if (need.includes("安静") && hasTag(tags, ["热闹", "太吵", "嘈杂"])) {
    return {
      key: "atmosphere",
      weight,
      score: HARD_CONFLICT_SCORE,
      reason: `评价标签与氛围「${need}」冲突`,
    };
  }
  if (need.includes("安静") || need.includes("私密")) {
    return {
      key: "atmosphere",
      weight,
      score: HARD_MISS_SCORE,
      reason: `硬约束未命中：氛围「${need}」`,
    };
  }
  return { key: "atmosphere", weight, score: 0.35, reason: `标签中未体现氛围「${need}」` };
}

function scoreFacility(need: string | null, tags: string[]): DimensionScore {
  const weight = MATCH_WEIGHTS.facility;
  if (!need) {
    return { key: "facility", weight, score: null, reason: "用户未指定设施" };
  }
  const keywords = [need];
  if (need.includes("包间")) {
    keywords.push("有包间", "包间");
  }
  if (need.includes("停车")) {
    keywords.push("停车", "停车方便");
  }
  if (hasTag(tags, keywords)) {
    return { key: "facility", weight, score: 1, reason: `评价标签支持设施「${need}」` };
  }
  if (need.includes("包间")) {
    return {
      key: "facility",
      weight,
      score: HARD_MISS_SCORE,
      reason: `硬约束未命中：设施「${need}」`,
    };
  }
  return { key: "facility", weight, score: 0.25, reason: `标签中未体现设施「${need}」` };
}

function scoreScene(need: string | null, tags: string[]): DimensionScore {
  const weight = MATCH_WEIGHTS.scene;
  if (!need) {
    return { key: "scene", weight, score: null, reason: "用户未指定场景" };
  }
  const keywords = [need];
  if (need.includes("家庭")) {
    keywords.push("适合家庭", "家庭");
  }
  if (need.includes("约会")) {
    keywords.push("适合约会", "约会");
  }
  if (need.includes("聚餐") || need.includes("团建")) {
    keywords.push("聚餐", "热闹");
  }
  if (hasTag(tags, keywords)) {
    return { key: "scene", weight, score: 1, reason: `评价标签支持场景「${need}」` };
  }
  return { key: "scene", weight, score: 0.4, reason: `标签中未体现场景「${need}」` };
}

const SPICY_CUISINES = new Set(["川菜", "湘菜", "火锅"]);
const MILD_CUISINES = new Set(["粤菜", "本帮菜", "杭帮菜", "日料", "西餐"]);

function wantsMildTaste(need: string): boolean {
  return /不辣|不要辣|少辣|清淡/.test(need);
}

function wantsSpicyTaste(need: string): boolean {
  return !wantsMildTaste(need) && /辣|麻辣|香辣/.test(need);
}

function hasMildTasteTag(tags: string[]): boolean {
  return tags.some((tag) => /不辣|清淡|少辣/.test(tag));
}

function hasSpicyTasteTag(tags: string[]): boolean {
  return tags.some(
    (tag) => /香辣|麻辣|微辣|重辣|太辣/.test(tag) || (tag.includes("辣") && !/不辣|少辣/.test(tag)),
  );
}

function scoreTaste(need: string | null, tags: string[], cuisine: string): DimensionScore {
  const weight = MATCH_WEIGHTS.taste;
  if (!need) {
    return { key: "taste", weight, score: null, reason: "用户未指定口味" };
  }

  if (wantsSpicyTaste(need)) {
    if (hasMildTasteTag(tags) && !hasSpicyTasteTag(tags)) {
      return {
        key: "taste",
        weight,
        score: HARD_MISS_SCORE,
        reason: `硬约束冲突：要辣，标签偏清淡/不辣`,
      };
    }
    if (hasSpicyTasteTag(tags)) {
      return { key: "taste", weight, score: 1, reason: `评价标签支持辣口` };
    }
    if (SPICY_CUISINES.has(cuisine)) {
      return { key: "taste", weight, score: 0.8, reason: `${cuisine} 通常能做辣` };
    }
    return {
      key: "taste",
      weight,
      score: HARD_MISS_SCORE,
      reason: `硬约束未命中：口味「${need}」`,
    };
  }

  if (wantsMildTaste(need)) {
    if (hasSpicyTasteTag(tags) && !hasMildTasteTag(tags)) {
      return {
        key: "taste",
        weight,
        score: HARD_MISS_SCORE,
        reason: `硬约束冲突：要不辣/清淡，标签偏辣`,
      };
    }
    if (hasMildTasteTag(tags)) {
      return { key: "taste", weight, score: 1, reason: `评价标签支持清淡/不辣` };
    }
    if (MILD_CUISINES.has(cuisine)) {
      return { key: "taste", weight, score: 0.8, reason: `${cuisine} 通常偏清淡` };
    }
    return {
      key: "taste",
      weight,
      score: HARD_MISS_SCORE,
      reason: `硬约束未命中：口味「${need}」`,
    };
  }

  if (hasTag(tags, [need])) {
    return { key: "taste", weight, score: 0.9, reason: `标签与口味「${need}」相关` };
  }
  return { key: "taste", weight, score: 0.5, reason: `无法从标签确认口味「${need}」` };
}

function scoreSelectionRate(rate: number | null | undefined): DimensionScore {
  const weight = MATCH_WEIGHTS.selectionRate;
  if (rate === null || rate === undefined) {
    return { key: "selectionRate", weight, score: null, reason: "暂无用户选择率" };
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`选择率 ${rate} 超出 0–1`);
  }
  const percent = Math.round(rate * 100);
  return {
    key: "selectionRate",
    weight,
    score: rate,
    reason: `用户选择率 ${percent}%`,
  };
}

/** 未指定的维度不参与加权，剩余权重重新归一 */
export function weightedTotal(dimensions: DimensionScore[]): number {
  let weightSum = 0;
  let scoreSum = 0;
  for (const item of dimensions) {
    if (item.score === null) {
      continue;
    }
    if (item.score < 0 || item.score > 1) {
      throw new Error(`维度 ${item.key} 的分数 ${item.score} 超出 0–1`);
    }
    weightSum += item.weight;
    scoreSum += item.score * item.weight;
  }
  if (weightSum === 0) {
    return 0.5;
  }
  return scoreSum / weightSum;
}

/** 按需求标签给单个商家打分，总分 0–1 */
export function scoreMerchant(need: ParseNeed, merchant: MerchantSnapshot): MatchScore {
  const dimensions: DimensionScore[] = [
    scoreCuisine(need.cuisine, merchant.cuisine),
    scoreBudget(need.budget, merchant.avgPrice),
    scoreLocation(need.location, merchant),
    scoreAtmosphere(need.atmosphere, merchant.tagNames),
    scoreFacility(need.facility, merchant.tagNames),
    scoreScene(need.scene, merchant.tagNames),
    scoreTaste(need.taste, merchant.tagNames, merchant.cuisine),
    scoreSelectionRate(merchant.selectionRate),
  ];
  return {
    total: weightedTotal(dimensions),
    dimensions,
  };
}

export function rankMerchants(
  need: ParseNeed,
  merchants: MerchantSnapshot[],
): RankedMerchant[] {
  return merchants
    .map((merchant) => ({ merchant, ...scoreMerchant(need, merchant) }))
    .sort((left, right) => right.total - left.total);
}
