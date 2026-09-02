import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCENE_TEMPLATES, nextSceneQuery, sceneQueriesInclude } from "./home-templates.ts";

describe("home-templates", () => {
  it("四个用餐类型都有不止一句需求", () => {
    assert.equal(SCENE_TEMPLATES.length, 4);
    for (const template of SCENE_TEMPLATES) {
      assert.ok(template.queries.length >= 3, template.label);
    }
  });

  it("同一类型连点会换句，不会一直停在第一句", () => {
    const dating = SCENE_TEMPLATES[0];
    if (!dating) {
      throw new Error("缺少周末约会模板");
    }
    const first = nextSceneQuery(dating, "");
    const second = nextSceneQuery(dating, first);
    const third = nextSceneQuery(dating, second);
    assert.equal(first, dating.queries[0]);
    assert.notEqual(second, first);
    assert.notEqual(third, second);
    assert.ok(sceneQueriesInclude(dating, second));
  });
});
