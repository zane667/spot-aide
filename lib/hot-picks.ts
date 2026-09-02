import { smoothedSelectionRate } from "./selection-rate.ts";

export const HOT_PICK_LIMIT = 3;
/** 首页「大家都在去」优先只看有过曝光的店；不够数时退回全库 */
export const MIN_HOT_IMPRESSIONS = 1;

export interface HotPick {
  id: string;
  name: string;
  cuisine: string;
  district: string;
  avgPrice: number;
  priorRate: number;
  impressions: number;
  selectionRate: number;
}

export interface HotPickSource {
  id: string;
  name: string;
  cuisine: string;
  district: string;
  avgPrice: number;
  priorRate: number;
  impressions: number;
  selections: number;
}

export type HomeLensId = "choice" | "mealtime" | "prior";

export interface MealSlot {
  id: "breakfast" | "lunch" | "afternoon" | "dinner" | "latenight";
  /** 写进搜索框的时间短语 */
  queryLabel: string;
  /** 板块标题用 */
  titleLabel: string;
  /** 卡片上的短标签 */
  chip: string;
  cuisines: string[];
}

export interface HomeLens {
  id: HomeLensId;
  title: string;
  subtitle: string;
  badge: "selectionRate" | "priorRate" | "mealtime";
  mealLabel: string | null;
  chip: string | null;
  picks: HotPick[];
}

/** 点首页热门店时填进搜索框，走解析确认，不直接跳结果 */
export function pickNeedQuery(pick: HotPick, mealLabel?: string | null): string {
  const place = `想在${pick.district}吃${pick.cuisine}，人均${pick.avgPrice}左右`;
  if (mealLabel) {
    return `${mealLabel}，${place}`;
  }
  return place;
}

export function toHotPick(row: HotPickSource): HotPick {
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    district: row.district,
    avgPrice: row.avgPrice,
    priorRate: row.priorRate,
    impressions: row.impressions,
    selectionRate: smoothedSelectionRate({
      priorRate: row.priorRate,
      impressions: row.impressions,
      selections: row.selections,
    }),
  };
}

function sortBySelectionRate(left: HotPick, right: HotPick): number {
  const delta = right.selectionRate - left.selectionRate;
  if (delta !== 0) {
    return delta;
  }
  return left.name.localeCompare(right.name, "zh-CN");
}

function sortByPriorRate(left: HotPick, right: HotPick): number {
  const delta = right.priorRate - left.priorRate;
  if (delta !== 0) {
    return delta;
  }
  return left.name.localeCompare(right.name, "zh-CN");
}

export function rankHotPicks(
  rows: HotPickSource[],
  limit: number,
  minImpressions: number = MIN_HOT_IMPRESSIONS,
): HotPick[] {
  if (limit < 1) {
    throw new Error(`热门店数量必须为正整数：${limit}`);
  }
  if (minImpressions < 0) {
    throw new Error(`最低曝光不能为负：${minImpressions}`);
  }
  const qualified = rows.filter((row) => row.impressions >= minImpressions);
  const pool = qualified.length >= limit ? qualified : rows;
  return pool.map(toHotPick).sort(sortBySelectionRate).slice(0, limit);
}

export function rankByPriorRate(rows: HotPickSource[], limit: number): HotPick[] {
  if (limit < 1) {
    throw new Error(`热门店数量必须为正整数：${limit}`);
  }
  return rows.map(toHotPick).sort(sortByPriorRate).slice(0, limit);
}

/**
 * 用上海时区的小时落到用餐时段。
 * 菜系是用餐习惯，不是评价结论，展示时必须写明。
 */
export function mealSlotForHour(hour: number): MealSlot {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`小时必须是 0–23 的整数：${hour}`);
  }
  if (hour >= 6 && hour <= 10) {
    return {
      id: "breakfast",
      queryLabel: "想吃早茶或午餐",
      titleLabel: "早午更合适",
      chip: "早午",
      cuisines: ["粤菜", "家常菜"],
    };
  }
  if (hour >= 11 && hour <= 14) {
    return {
      id: "lunch",
      queryLabel: "想吃午饭",
      titleLabel: "午饭更合适",
      chip: "午饭",
      cuisines: ["家常菜", "本帮菜", "川菜", "湘菜", "韩餐"],
    };
  }
  if (hour >= 15 && hour <= 16) {
    return {
      id: "afternoon",
      queryLabel: "下午想随便吃点",
      titleLabel: "下午更合适",
      chip: "下午",
      cuisines: ["西餐", "日料", "粤菜"],
    };
  }
  if (hour >= 17 && hour <= 20) {
    return {
      id: "dinner",
      queryLabel: "想吃晚饭",
      titleLabel: "晚饭更合适",
      chip: "晚饭",
      cuisines: ["火锅", "川菜", "粤菜", "日料", "烧烤", "西餐"],
    };
  }
  return {
    id: "latenight",
    queryLabel: "想吃夜宵",
    titleLabel: "夜宵更合适",
    chip: "夜宵",
    cuisines: ["烧烤", "火锅"],
  };
}

export function shanghaiHour(now: Date): number {
  const hourPart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    hour12: false,
  })
    .formatToParts(now)
    .find((part) => part.type === "hour");
  if (!hourPart) {
    throw new Error("无法解析上海时区的小时");
  }
  const hour = Number.parseInt(hourPart.value, 10);
  if (hour === 24) {
    return 0;
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`解析到的小时不合法：${hourPart.value}`);
  }
  return hour;
}

export function rankByMealtime(rows: HotPickSource[], limit: number, hour: number): HotPick[] {
  const slot = mealSlotForHour(hour);
  const matched = rows.filter((row) => slot.cuisines.includes(row.cuisine));
  const pool = matched.length >= limit ? matched : rows;
  return rankByPriorRate(pool, limit);
}

export function buildHomeLenses(rows: HotPickSource[], now: Date, limit: number = HOT_PICK_LIMIT): HomeLens[] {
  const hour = shanghaiHour(now);
  const slot = mealSlotForHour(hour);
  const qualified = rows.filter((row) => row.impressions >= MIN_HOT_IMPRESSIONS);
  const usedFloor = qualified.length >= limit;

  return [
    {
      id: "choice",
      title: "大家都在去",
      subtitle: usedFloor
        ? "只统计被结果页露出过的店，按用户选择率排"
        : "还没人点过，先按评价先验；有曝光后会改走选择率",
      badge: "selectionRate",
      mealLabel: null,
      chip: null,
      picks: rankHotPicks(rows, limit),
    },
    {
      id: "mealtime",
      title: `这个点儿更适合 · ${slot.chip}`,
      subtitle: `按现在的用餐习惯圈「${slot.cuisines.join("、")}」，不是评价结论`,
      badge: "mealtime",
      mealLabel: slot.queryLabel,
      chip: slot.chip,
      picks: rankByMealtime(rows, limit, hour),
    },
    {
      id: "prior",
      title: "评价里更受认可",
      subtitle: "只用评价算出的先验，和有没有人点去无关",
      badge: "priorRate",
      mealLabel: null,
      chip: null,
      picks: rankByPriorRate(rows, limit),
    },
  ];
}
