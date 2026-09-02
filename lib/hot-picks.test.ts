import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_HOT_IMPRESSIONS,
  buildHomeLenses,
  mealSlotForHour,
  pickNeedQuery,
  rankByMealtime,
  rankHotPicks,
  type HotPickSource,
} from "./hot-picks.ts";

function shop(overrides: Partial<HotPickSource> = {}): HotPickSource {
  return {
    id: "m1",
    name: "甲馆",
    cuisine: "粤菜",
    district: "徐家汇",
    avgPrice: 180,
    priorRate: 0.6,
    impressions: 0,
    selections: 0,
    ...overrides,
  };
}

describe("hot-picks", () => {
  it("按平滑选择率从高到低取前几家", () => {
    const ranked = rankHotPicks(
      [
        shop({ id: "low", name: "低选", priorRate: 0.4 }),
        shop({ id: "high", name: "高选", priorRate: 0.9 }),
        shop({ id: "mid", name: "中选", priorRate: 0.7 }),
      ],
      2,
    );
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.id, "high");
    assert.equal(ranked[1]?.id, "mid");
  });

  it("有足够曝光时，零曝光的高先验店不能挤进选择率榜", () => {
    const ranked = rankHotPicks(
      [
        shop({ id: "cold", name: "冷门", priorRate: 0.99, impressions: 0 }),
        shop({ id: "a", name: "甲", priorRate: 0.5, impressions: MIN_HOT_IMPRESSIONS, selections: 1 }),
        shop({ id: "b", name: "乙", priorRate: 0.5, impressions: MIN_HOT_IMPRESSIONS, selections: 0 }),
        shop({ id: "c", name: "丙", priorRate: 0.4, impressions: MIN_HOT_IMPRESSIONS, selections: 0 }),
      ],
      3,
    );
    assert.equal(ranked.length, 3);
    assert.ok(ranked.every((item) => item.id !== "cold"));
    assert.equal(ranked[0]?.id, "a");
  });

  it("曝光不足三家时退回全库，避免首页空榜", () => {
    const ranked = rankHotPicks(
      [
        shop({ id: "cold", name: "冷门", priorRate: 0.9, impressions: 0 }),
        shop({ id: "warm", name: "有曝光", priorRate: 0.4, impressions: 2, selections: 1 }),
      ],
      2,
    );
    assert.equal(ranked.map((item) => item.id).join(","), "cold,warm");
  });

  it("晚饭时段只从火锅烧烤等菜系里取", () => {
    const ranked = rankByMealtime(
      [
        shop({ id: "home", name: "家常", cuisine: "家常菜", priorRate: 0.95 }),
        shop({ id: "hot", name: "火锅店", cuisine: "火锅", priorRate: 0.7 }),
        shop({ id: "bbq", name: "烧烤店", cuisine: "烧烤", priorRate: 0.6 }),
        shop({ id: "yue", name: "粤菜店", cuisine: "粤菜", priorRate: 0.65 }),
      ],
      3,
      19,
    );
    assert.equal(ranked.length, 3);
    assert.ok(ranked.every((item) => ["火锅", "烧烤", "粤菜"].includes(item.cuisine)));
    assert.ok(ranked.every((item) => item.id !== "home"));
  });

  it("用餐时段映射符合上海常见节奏", () => {
    assert.equal(mealSlotForHour(8).id, "breakfast");
    assert.equal(mealSlotForHour(12).id, "lunch");
    assert.equal(mealSlotForHour(15).id, "afternoon");
    assert.equal(mealSlotForHour(19).id, "dinner");
    assert.equal(mealSlotForHour(23).id, "latenight");
    assert.equal(mealSlotForHour(2).id, "latenight");
  });

  it("三个首页维度标题不同，选择率榜和先验榜不是同一套店时也能产出三家", () => {
    const lenses = buildHomeLenses(
      [
        shop({ id: "1", name: "一", cuisine: "火锅", priorRate: 0.5, impressions: 4, selections: 3 }),
        shop({ id: "2", name: "二", cuisine: "家常菜", priorRate: 0.9, impressions: 0 }),
        shop({ id: "3", name: "三", cuisine: "烧烤", priorRate: 0.4, impressions: 3, selections: 1 }),
        shop({ id: "4", name: "四", cuisine: "粤菜", priorRate: 0.8, impressions: 2, selections: 0 }),
      ],
      new Date("2026-08-31T11:00:00+08:00"),
      3,
    );
    assert.equal(lenses.length, 3);
    assert.deepEqual(
      lenses.map((item) => item.id),
      ["choice", "mealtime", "prior"],
    );
    assert.ok(new Set(lenses.map((item) => item.title)).size === 3);
  });

  it("点选热门店生成可解析的需求句，时段透镜会带上时间", () => {
    const pick = {
      id: "m1",
      name: "城隍庙火锅",
      cuisine: "火锅",
      district: "五角场",
      avgPrice: 118,
      priorRate: 0.7,
      impressions: 2,
      selectionRate: 0.75,
    };
    assert.equal(pickNeedQuery(pick), "想在五角场吃火锅，人均118左右");
    assert.equal(pickNeedQuery(pick, "想吃晚饭"), "想吃晚饭，想在五角场吃火锅，人均118左右");
  });
});
