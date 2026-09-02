/**
 * 全链路验证：parse → analyze → recommend（SSE）
 *
 * 用法（需先另开终端跑 npm run dev）：
 *   cd my-demo && node scripts/test-pipeline.ts
 *   node scripts/test-pipeline.ts --query=周末带父母吃饭，要安静有包间
 */

import { recommendResultSchema } from "../lib/schemas.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DEFAULT_QUERY = "带4岁小孩，预算200，想吃粤菜，要有包间";
const PARSE_TIMEOUT_MS = 45_000;
const ANALYZE_TIMEOUT_MS = 180_000;
const RECOMMEND_TIMEOUT_MS = 45_000;

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${path} 超时（${timeoutMs / 1000} 秒）`, { cause: error });
    }
    throw new Error(
      `${path} 请求失败：${error instanceof Error ? error.message : String(error)}。请确认已在 my-demo 执行 npm run dev`,
      { cause: error },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`${path} 返回的不是合法 JSON（HTTP ${response.status}）`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`${path} HTTP ${response.status}：${JSON.stringify(payload)}`);
  }

  return payload;
}

function assertOkData(path: string, payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("ok" in payload)) {
    throw new Error(`${path} 响应缺少 ok 字段：${JSON.stringify(payload)}`);
  }
  const record = payload as { ok: unknown; data?: unknown; error?: unknown };
  if (record.ok !== true) {
    throw new Error(`${path} 业务失败：${JSON.stringify(record.error ?? payload)}`);
  }
  if (record.data === undefined) {
    throw new Error(`${path} 成功响应缺少 data`);
  }
  return record.data;
}

/** 消费 recommend SSE：打印增量并拼出完整正文 */
async function readRecommendSse(timeoutMs: number, body: unknown): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`/api/recommend 超时（${timeoutMs / 1000} 秒）`, { cause: error });
    }
    throw new Error(
      `/api/recommend 请求失败：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const payload = await response.text();
    throw new Error(`/api/recommend 未返回 SSE（HTTP ${response.status}）：${payload}`);
  }

  if (!response.body) {
    throw new Error("/api/recommend SSE 响应缺少 body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part
          .split(/\r?\n/)
          .map((item) => item.trim())
          .find((item) => item.startsWith("data:"));
        if (!line) {
          continue;
        }
        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") {
          continue;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch (error) {
          throw new Error(`/api/recommend SSE 分片不是合法 JSON：${data.slice(0, 200)}`, {
            cause: error,
          });
        }

        if (typeof payload === "object" && payload !== null && "error" in payload) {
          throw new Error(`/api/recommend 流式错误：${JSON.stringify(payload)}`);
        }
        if (typeof payload !== "object" || payload === null || !("delta" in payload)) {
          throw new Error(`/api/recommend SSE 缺少 delta：${data.slice(0, 200)}`);
        }
        const delta = (payload as { delta: unknown }).delta;
        if (typeof delta !== "string") {
          throw new Error(`/api/recommend SSE delta 不是字符串：${data.slice(0, 200)}`);
        }
        text += delta;
        process.stdout.write(delta);
      }
    }
  } finally {
    await reader.cancel();
  }

  if (text.trim() === "") {
    throw new Error("/api/recommend SSE 结束后没有收到任何 delta");
  }
  return text;
}

function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const source = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`推荐正文无法解析为 JSON：${source.slice(0, 300)}`, { cause: error });
  }
}

async function main(): Promise<void> {
  const query = readArg("query") ?? DEFAULT_QUERY;
  console.log(`======= 探店参谋全链路 =======`);
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`query=${query}\n`);

  console.log("① POST /api/parse");
  const parsePayload = await postJson("/api/parse", { query }, PARSE_TIMEOUT_MS);
  const needs = assertOkData("/api/parse", parsePayload);
  console.log(JSON.stringify(needs, null, 2));

  console.log("\n② POST /api/analyze（匹配 Top 5 并逐店分析，可能需要一两分钟）");
  const analyzePayload = await postJson("/api/analyze", needs, ANALYZE_TIMEOUT_MS);
  const analyzeData = assertOkData("/api/analyze", analyzePayload) as {
    candidateCount?: unknown;
    candidates?: unknown;
  };
  if (!Array.isArray(analyzeData.candidates)) {
    throw new Error("/api/analyze 缺少 candidates 数组");
  }
  console.log(`候选数：${analyzeData.candidateCount ?? analyzeData.candidates.length}`);
  for (const [index, item] of analyzeData.candidates.entries()) {
    if (typeof item !== "object" || item === null) {
      throw new Error(`/api/analyze candidates[${index}] 不是对象`);
    }
    const row = item as {
      merchant?: { name?: string };
      match?: { total?: number };
      analysis?: unknown;
      error?: { message?: string } | null;
    };
    const name = row.merchant?.name ?? "(未知商家)";
    const score = row.match?.total ?? "?";
    const status = row.analysis ? "分析成功" : `分析失败：${row.error?.message ?? "未知错误"}`;
    console.log(`  ${index + 1}. ${name}  匹配 ${score}  ${status}`);
  }

  console.log("\n③ POST /api/recommend（SSE 流式）\n----- 原始增量 -----");
  const raw = await readRecommendSse(RECOMMEND_TIMEOUT_MS, {
    needs,
    candidates: analyzeData.candidates,
  });
  console.log("\n----- 原始增量结束 -----\n");

  const parsed = recommendResultSchema.safeParse(parseModelJson(raw));
  if (!parsed.success) {
    throw new Error(
      `推荐 JSON 未通过校验：${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("；")}`,
    );
  }

  console.log("======= Top 3 推荐（校验通过）=======");
  for (const [index, item] of parsed.data.recommendations.entries()) {
    console.log(`\n#${index + 1} ${item.merchant}`);
    console.log(`推荐理由：${item.reason}`);
    console.log(`注意事项：${item.notes}`);
  }
  console.log(`\n差距说明：${parsed.data.gap ?? "无（需求基本可覆盖）"}`);
}

main().catch((error: unknown) => {
  console.error("\n全链路验证失败：");
  console.error(error);
  process.exitCode = 1;
});
