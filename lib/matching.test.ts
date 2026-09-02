import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseBudgetRange,
  rankMerchants,
  scoreMerchant,
  weightedTotal,
  type MerchantSnapshot,
} from "./matching.ts";
import type { ParseNeed } from "./schemas.ts";

function need(overrides: Partial<ParseNeed> = {}): ParseNeed {
  return {
    scene: null,
    budget: null,
    cuisine: null,
    taste: null,
    atmosphere: null,
    facility: null,
    crowd: null,
    time: null,
    location: null,
    inference: "测试",
    ...overrides,
  };
}

function shop(overrides: Partial<MerchantSnapshot> = {}): MerchantSnapshot {
  return {
    id: "m1",
    name: "测试馆",
    cuisine: "粤菜",
    avgPrice: 180,
    address: "徐家汇衡山路1号",
    district: "徐家汇",
    tagNames: ["适合家庭", "有包间", "安静"],
    ...overrides,
  };
}

describe("matching", () => {
  it("菜系完全命中的店分高于菜系不符的店", () => {
    const query = need({ cuisine: "粤菜" });
    const yue = scoreMerchant(query, shop({ cuisine: "粤菜" }));
    const huo = scoreMerchant(query, shop({ id: "m2", cuisine: "火锅" }));
    assert.ok(yue.total > huo.total);
    const cuisineHit = yue.dimensions.find((item) => item.key === "cuisine");
    assert.equal(cuisineHit?.score, 1);
  });

  it("人均落在预算内的店分高于远超预算的店", () => {
    const query = need({ budget: "200" });
    const fit = scoreMerchant(query, shop({ avgPrice: 180 }));
    const far = scoreMerchant(query, shop({ id: "m2", avgPrice: 520 }));
    assert.ok(fit.total > far.total);
    const budgetHit = fit.dimensions.find((item) => item.key === "budget");
    assert.equal(budgetHit?.score, 1);
  });

  it("用户未指定的维度不参与加权，不会压低总分", () => {
    const onlyCuisine = scoreMerchant(need({ cuisine: "粤菜" }), shop());
    const cuisineDim = onlyCuisine.dimensions.find((item) => item.key === "cuisine");
    const unused = onlyCuisine.dimensions.filter((item) => item.key !== "cuisine");
    assert.equal(cuisineDim?.score, 1);
    assert.ok(unused.every((item) => item.score === null));
    assert.equal(onlyCuisine.total, 1);
    assert.equal(
      weightedTotal([
        { key: "cuisine", weight: 0.28, score: 1, reason: "" },
        { key: "budget", weight: 0.22, score: null, reason: "" },
      ]),
      1,
    );
  });

  it("氛围/设施标签命中会提高分数", () => {
    const query = need({ atmosphere: "安静", facility: "包间" });
    const hit = scoreMerchant(
      query,
      shop({ tagNames: ["安静", "有包间"] }),
    );
    const miss = scoreMerchant(query, shop({ id: "m2", tagNames: ["热闹", "人多"] }));
    assert.ok(hit.total > miss.total);
    assert.equal(hit.dimensions.find((item) => item.key === "atmosphere")?.score, 1);
    assert.equal(hit.dimensions.find((item) => item.key === "facility")?.score, 1);
  });

  it("安静/包间未命中按硬约束重罚，热闹店不能挤进前列", () => {
    const query = need({ atmosphere: "安静", facility: "包间", scene: "家庭" });
    const hit = scoreMerchant(
      query,
      shop({ tagNames: ["安静", "有包间", "适合家庭"] }),
    );
    const miss = scoreMerchant(
      query,
      shop({ id: "m2", tagNames: ["适合家庭", "热闹", "人多"] }),
    );
    const atmosphereMiss = miss.dimensions.find((item) => item.key === "atmosphere");
    const facilityMiss = miss.dimensions.find((item) => item.key === "facility");
    assert.ok((atmosphereMiss?.score ?? 1) <= 0.05);
    assert.ok((facilityMiss?.score ?? 1) <= 0.05);
    assert.ok(hit.total >= 0.9);
    assert.ok(miss.total < 0.45);
    assert.ok(hit.total - miss.total >= 0.45);
  });

  it("要辣时香辣店分高于清淡店，不辣标签不能当成命中", () => {
    const query = need({ taste: "辣" });
    const spicy = scoreMerchant(
      query,
      shop({ cuisine: "湘菜", tagNames: ["香辣", "下饭"] }),
    );
    const mild = scoreMerchant(
      query,
      shop({ id: "m2", cuisine: "粤菜", tagNames: ["清淡", "不辣"] }),
    );
    assert.ok(spicy.total > mild.total);
    assert.equal(spicy.dimensions.find((item) => item.key === "taste")?.score, 1);
    assert.ok((mild.dimensions.find((item) => item.key === "taste")?.score ?? 1) <= 0.05);
  });

  it("商圈命中的店排在位置不符的店前面，且能解析预算区间", () => {
    const range = parseBudgetRange("150-200");
    assert.deepEqual(range, { min: 150, max: 200 });

    const ranked = rankMerchants(need({ location: "徐家汇" }), [
      shop({ id: "far", name: "五角场店", district: "五角场", address: "淞沪路1号" }),
      shop({ id: "near", name: "徐家汇店", district: "徐家汇", address: "衡山路1号" }),
    ]);
    assert.equal(ranked[0]?.merchant.id, "near");
    assert.ok((ranked[0]?.total ?? 0) > (ranked[1]?.total ?? 0));
  });

  it("选择率只作弱加权，不能压过菜系不匹配", () => {
    const query = need({ cuisine: "粤菜" });
    const hitLow = scoreMerchant(query, shop({ cuisine: "粤菜", selectionRate: 0.1 }));
    const missHigh = scoreMerchant(
      query,
      shop({ id: "m2", cuisine: "火锅", selectionRate: 0.99 }),
    );
    assert.ok(hitLow.total > missHigh.total);
  });

  it("同菜系时选择率更高的店排更前", () => {
    const ranked = rankMerchants(need({ cuisine: "粤菜" }), [
      shop({ id: "low", selectionRate: 0.2 }),
      shop({ id: "high", name: "高选馆", selectionRate: 0.9 }),
    ]);
    assert.equal(ranked[0]?.merchant.id, "high");
  });
});
