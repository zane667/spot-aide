import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hardNeedViolations, pickRecommendable } from "./recommend-guard.ts";
import type { AnalyzeCandidate, AnalyzeInsight, ParseNeed } from "./schemas.ts";

function need(overrides: Partial<ParseNeed> = {}): ParseNeed {
  return {
    scene: "家庭",
    budget: null,
    cuisine: null,
    taste: null,
    atmosphere: "安静",
    facility: "包间",
    crowd: null,
    time: "周末",
    location: null,
    inference: "测试",
    ...overrides,
  };
}

function insight(overrides: Partial<AnalyzeInsight> = {}): AnalyzeInsight {
  return {
    taste_quality: 8,
    environment: 8,
    service: 8,
    value: 7,
    scene_fit: 8,
    top_tags: ["适合家庭", "有包间", "安静"],
    risk_signals: ["等位久", "停车难", "分量少"],
    best_for: "家庭聚餐",
    avoid_if: "赶时间",
    ...overrides,
  };
}

function candidate(overrides: Partial<AnalyzeCandidate> = {}): AnalyzeCandidate {
  return {
    merchant: {
      id: "m1",
      name: "白玉粤菜",
      cuisine: "粤菜",
      avgPrice: 180,
      address: "衡山路1号",
      district: "徐家汇",
    },
    match: {
      total: 100,
      dimensions: [
        { key: "atmosphere", weight: 0.12, score: 1, reason: "安静" },
        { key: "facility", weight: 0.12, score: 1, reason: "包间" },
        { key: "cuisine", weight: 0.28, score: null, reason: "未指定" },
      ],
    },
    reviewCount: 20,
    dataInsufficient: false,
    selectionRate: 0.6,
    reviewExcerpts: ["蒸点出品稳，适合家庭聚餐"],
    analysis: insight(),
    error: null,
    ...overrides,
  };
}

describe("recommend-guard", () => {
  it("安静+包间都命中且分析无嘈杂时可以推荐", () => {
    assert.deepEqual(hardNeedViolations(need(), candidate()), []);
  });

  it("分析写了嘈杂或环境分过低时剔除", () => {
    const noisy = hardNeedViolations(
      need(),
      candidate({
        merchant: { ...candidate().merchant, id: "m2", name: "西街湘菜馆" },
        analysis: insight({
          environment: 5,
          risk_signals: ["环境嘈杂", "等位久", "辣度不准"],
          avoid_if: "父母喜欢安静",
        }),
      }),
    );
    assert.ok(noisy.some((item) => item.includes("吵") || item.includes("环境分")));
  });

  it("分析只写「吵」或「油烟」也要剔除", () => {
    const smoke = hardNeedViolations(
      need(),
      candidate({
        analysis: insight({
          environment: 8,
          risk_signals: ["油烟味重", "等位久", "停车难"],
        }),
      }),
    );
    const loud = hardNeedViolations(
      need(),
      candidate({
        analysis: insight({
          environment: 8,
          risk_signals: ["有点吵", "等位久", "停车难"],
        }),
      }),
    );
    assert.ok(smoke.some((item) => item.includes("油烟") || item.includes("冲突")));
    assert.ok(loud.some((item) => item.includes("冲突")));
  });

  it("要安静时环境分 6 分也剔除", () => {
    const mid = hardNeedViolations(
      need(),
      candidate({
        analysis: insight({ environment: 6 }),
      }),
    );
    assert.ok(mid.some((item) => item.includes("环境分 6")));
  });

  it("包间标签硬约束未命中时剔除", () => {
    const miss = hardNeedViolations(
      need(),
      candidate({
        match: {
          total: 40,
          dimensions: [
            { key: "atmosphere", weight: 0.12, score: 1, reason: "安静" },
            { key: "facility", weight: 0.12, score: 0.05, reason: "硬约束未命中" },
          ],
        },
      }),
    );
    assert.ok(miss.some((item) => item.includes("包间")));
  });

  it("要辣时清淡分析的店要剔除", () => {
    const spicyNeed = need({
      atmosphere: null,
      facility: null,
      taste: "辣",
    });
    const mildShop = candidate({
      match: {
        total: 40,
        dimensions: [{ key: "taste", weight: 0.12, score: 0.05, reason: "清淡" }],
      },
      analysis: insight({
        top_tags: ["清淡", "适合家庭", "出品稳"],
        risk_signals: ["等位久", "停车难", "分量少"],
      }),
    });
    const hits = hardNeedViolations(spicyNeed, mildShop);
    assert.ok(hits.some((item) => item.includes("辣") || item.includes("清淡")));
  });

  it("只把可推荐店交给模型，冲突店进 ineligible", () => {
    const good = candidate();
    const bad = candidate({
      merchant: { ...candidate().merchant, id: "m2", name: "西街湘菜馆" },
      analysis: insight({
        environment: 4,
        risk_signals: ["太吵", "等位久", "停车难"],
      }),
    });
    const guarded = pickRecommendable(need(), [bad, good]);
    assert.equal(guarded.usedFallback, false);
    assert.deepEqual(
      guarded.recommendable.map((item) => item.merchant.name),
      ["白玉粤菜"],
    );
    assert.deepEqual(
      guarded.ineligible.map((item) => item.candidate.merchant.name),
      ["西街湘菜馆"],
    );
  });
});
