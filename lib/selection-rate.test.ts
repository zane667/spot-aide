import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRIOR_PSEUDO_COUNT,
  computePriorRate,
  formatSelectionRatePercent,
  smoothedSelectionRate,
  type ReviewPriorInput,
} from "./selection-rate.ts";

function review(overrides: Partial<ReviewPriorInput> = {}): ReviewPriorInput {
  return {
    rating: 5,
    sentiment: "positive",
    tagNames: ["适合家庭"],
    ...overrides,
  };
}

describe("selection-rate", () => {
  it("好评高分店的先验高于差评店", () => {
    const good = computePriorRate([
      review(),
      review(),
      review(),
      review({ rating: 4 }),
      review({ rating: 4 }),
    ]);
    const bad = computePriorRate([
      review({ rating: 1, sentiment: "negative", tagNames: ["等位久", "太吵"] }),
      review({ rating: 2, sentiment: "negative", tagNames: ["服务差"] }),
      review({ rating: 2, sentiment: "negative", tagNames: ["性价比低"] }),
      review({ rating: 1, sentiment: "negative", tagNames: ["停车难"] }),
      review({ rating: 3, sentiment: "neutral", tagNames: ["中规中矩"] }),
    ]);
    assert.ok(good > 0.6);
    assert.ok(bad < 0.45);
    assert.ok(good > bad);
  });

  it("评价不足 5 条时先验打 0.7 折", () => {
    const thin = [review(), review(), review(), review()];
    const undiscounted = 0.45 * (5 / 5) + 0.35 * 1 + 0.2 * 1;
    assert.equal(computePriorRate(thin), undiscounted * 0.7);
  });

  it("无评价时仍给出可展示的先验，不抛错", () => {
    const empty = computePriorRate([]);
    assert.ok(empty >= 0.05 && empty <= 0.95);
  });

  it("平滑选择率在无曝光时接近先验，确认后会上升", () => {
    const prior = 0.6;
    const initial = smoothedSelectionRate({
      priorRate: prior,
      impressions: 0,
      selections: 0,
    });
    assert.equal(initial, prior);

    const afterShow = smoothedSelectionRate({
      priorRate: prior,
      impressions: 1,
      selections: 0,
    });
    assert.ok(afterShow < initial);

    const afterPick = smoothedSelectionRate({
      priorRate: prior,
      impressions: 1,
      selections: 1,
    });
    assert.ok(afterPick > afterShow);

    const offList = smoothedSelectionRate({
      priorRate: prior,
      impressions: 0,
      selections: 1,
    });
    assert.ok(offList > initial);
    assert.equal(
      offList,
      (1 + prior * PRIOR_PSEUDO_COUNT) / PRIOR_PSEUDO_COUNT,
    );
  });

  it("百分比展示四舍五入到整数", () => {
    assert.equal(formatSelectionRatePercent(0.624), "62%");
    assert.equal(formatSelectionRatePercent(0.625), "63%");
  });
});
