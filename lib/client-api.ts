import {
  analyzeInsightSchema,
  parseNeedSchema,
  recommendResultSchema,
  type AnalyzeCandidate,
  type AnalyzeInsight,
  type ChatTurn,
  type ChoiceSource,
  type ParseNeed,
  type RecommendResult,
} from "./schemas";

interface ApiErrorBody {
  ok?: unknown;
  data?: unknown;
  error?: { code?: string; message?: string };
}

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${path} 超时，请稍后重试`, { cause: error });
    }
    throw new Error(`${path} 请求失败`, { cause: error });
  }

  let payload: ApiErrorBody;
  try {
    payload = (await response.json()) as ApiErrorBody;
  } catch (error) {
    throw new Error(`${path} 返回的不是合法 JSON`, { cause: error });
  }

  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error?.message ?? `${path} 失败（HTTP ${response.status}）`);
  }
  return payload.data;
}

async function getJson(path: string, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${path} 超时，请稍后重试`, { cause: error });
    }
    throw new Error(`${path} 请求失败`, { cause: error });
  }

  let payload: ApiErrorBody;
  try {
    payload = (await response.json()) as ApiErrorBody;
  } catch (error) {
    throw new Error(`${path} 返回的不是合法 JSON`, { cause: error });
  }

  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error?.message ?? `${path} 失败（HTTP ${response.status}）`);
  }
  return payload.data;
}

export async function parseQuery(query: string): Promise<ParseNeed> {
  const data = await postJson("/api/parse", { query }, 45_000);
  const parsed = parseNeedSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("需求解析结果字段不合法");
  }
  return parsed.data;
}

export interface AnalyzePayload {
  candidateCount: number;
  candidates: AnalyzeCandidate[];
}

export async function analyzeNeeds(needs: ParseNeed): Promise<AnalyzePayload> {
  const data = await postJson("/api/analyze", needs, 180_000);
  if (typeof data !== "object" || data === null || !("candidates" in data)) {
    throw new Error("评价分析返回缺少 candidates");
  }
  const record = data as { candidateCount?: unknown; candidates: unknown };
  if (!Array.isArray(record.candidates)) {
    throw new Error("评价分析 candidates 不是数组");
  }
  return {
    candidateCount:
      typeof record.candidateCount === "number"
        ? record.candidateCount
        : record.candidates.length,
    candidates: record.candidates as AnalyzeCandidate[],
  };
}

async function readRecommendSse(
  body: unknown,
  onDelta?: (chunk: string) => void,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new Error("推荐请求失败", { cause: error });
  }

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`推荐接口失败：${text.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";

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
        const payload = JSON.parse(data) as { delta?: string; error?: { message?: string } };
        if (payload.error) {
          throw new Error(payload.error.message ?? "推荐流式错误");
        }
        if (typeof payload.delta === "string") {
          raw += payload.delta;
          onDelta?.(payload.delta);
        }
      }
    }
  } finally {
    await reader.cancel();
  }

  return raw;
}

export async function streamRecommend(
  needs: ParseNeed,
  candidates: AnalyzeCandidate[],
): Promise<RecommendResult> {
  const raw = await readRecommendSse({ needs, candidates });
  const trimmed = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (error) {
    throw new Error("推荐正文不是合法 JSON", { cause: error });
  }
  const parsed = recommendResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("推荐结果字段不合法");
  }
  return parsed.data;
}

export async function streamFollowup(
  needs: ParseNeed,
  candidates: AnalyzeCandidate[],
  previous: RecommendResult,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void,
): Promise<string> {
  const text = await readRecommendSse({ needs, candidates, previous, messages }, onDelta);
  if (text.trim() === "") {
    throw new Error("追问没有返回内容");
  }
  return text.trim();
}

export interface MerchantInsightPayload {
  merchant: {
    id: string;
    name: string;
    cuisine: string;
    avgPrice: number;
    district: string;
  };
  analysis: AnalyzeInsight;
  view: {
    care_about: string[];
    complaint_focus: string[];
    advantage: string;
    watch_out: string;
  };
}

export async function fetchMerchantInsight(merchantId: string): Promise<MerchantInsightPayload> {
  const data = await postJson("/api/insight", { merchantId }, 45_000);
  if (typeof data !== "object" || data === null || !("analysis" in data) || !("view" in data)) {
    throw new Error("经营洞察返回缺少 analysis");
  }
  const record = data as MerchantInsightPayload;
  const parsed = analyzeInsightSchema.safeParse(record.analysis);
  if (!parsed.success) {
    throw new Error("经营洞察字段不合法");
  }
  return { ...record, analysis: parsed.data };
}

export interface SessionMerchantRate {
  id: string;
  name: string;
  selectionRate: number;
}

export interface RecommendSessionPayload {
  sessionId: string;
  alreadyRecorded: boolean;
  choice: { merchantId: string; name: string; source: string } | null;
  merchants: SessionMerchantRate[];
}

export async function recordRecommendSession(
  sessionId: string,
  needs: ParseNeed,
  merchants: Array<{ id: string; rank: number }>,
): Promise<RecommendSessionPayload> {
  const data = await postJson("/api/session", { sessionId, needs, merchants }, 15_000);
  if (typeof data !== "object" || data === null || !("sessionId" in data) || !("merchants" in data)) {
    throw new Error("推荐场次返回缺少 sessionId");
  }
  return data as RecommendSessionPayload;
}

export interface MerchantSearchHit {
  id: string;
  name: string;
  cuisine: string;
  district: string;
  avgPrice: number;
  selectionRate: number;
}

export async function searchMerchants(query: string): Promise<MerchantSearchHit[]> {
  const data = await getJson(`/api/merchants?q=${encodeURIComponent(query)}`, 10_000);
  if (typeof data !== "object" || data === null || !("merchants" in data)) {
    throw new Error("商家搜索返回缺少 merchants");
  }
  const record = data as { merchants: MerchantSearchHit[] };
  if (!Array.isArray(record.merchants)) {
    throw new Error("商家搜索 merchants 不是数组");
  }
  return record.merchants;
}

export interface ChoicePayload {
  sessionId: string;
  merchantId: string;
  name: string;
  source: ChoiceSource;
  selectionRate: number;
}

export async function submitChoice(
  sessionId: string,
  merchantId: string,
  source: ChoiceSource,
): Promise<ChoicePayload> {
  const data = await postJson("/api/choice", { sessionId, merchantId, source }, 10_000);
  if (typeof data !== "object" || data === null || !("merchantId" in data) || !("name" in data)) {
    throw new Error("确认去向返回缺少商家");
  }
  return data as ChoicePayload;
}
