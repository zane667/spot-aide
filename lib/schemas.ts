import { z } from "zod";

const nullableString = z.union([z.string(), z.null()]);

/** POST /api/parse 入参 */
export const parseRequestSchema = z.object({
  query: z
    .string({ error: "query 必须是字符串" })
    .max(500, "query 不能超过 500 字"),
});

/** 需求解析模型输出，与 lib/prompts.ts 锁死的 JSON 一致 */
export const parseNeedSchema = z
  .object({
    scene: nullableString,
    budget: nullableString,
    cuisine: nullableString,
    taste: nullableString,
    atmosphere: nullableString,
    facility: nullableString,
    crowd: z.union([z.number().int(), z.null()]),
    time: nullableString,
    location: nullableString,
    inference: z.string().min(1),
  })
  .strict();

export type ParseNeed = z.infer<typeof parseNeedSchema>;

const score = z.number().int().min(1).max(10);

/** 评价分析模型输出，与 lib/prompts.ts 锁死的 JSON 一致 */
export const analyzeInsightSchema = z
  .object({
    taste_quality: score,
    environment: score,
    service: score,
    value: score,
    scene_fit: score,
    top_tags: z.array(z.string().min(1)).length(3),
    risk_signals: z.array(z.string().min(1)).length(3),
    best_for: z.string().min(1),
    avoid_if: z.string().min(1),
  })
  .strict();

export type AnalyzeInsight = z.infer<typeof analyzeInsightSchema>;

/** POST /api/analyze 入参：直接使用需求解析结果 */
export const analyzeRequestSchema = parseNeedSchema;

export const CANDIDATE_LIMIT = 5;
export const REVIEW_INSUFFICIENT_THRESHOLD = 5;

const matchDimensionSchema = z.object({
  key: z.string(),
  weight: z.number(),
  score: z.union([z.number(), z.null()]),
  reason: z.string(),
});

/** 与 POST /api/analyze 返回的单个候选商家结构对齐 */
export const analyzeCandidateSchema = z.object({
  merchant: z.object({
    id: z.string(),
    name: z.string().min(1),
    cuisine: z.string(),
    avgPrice: z.number(),
    address: z.string(),
    district: z.string(),
  }),
  match: z.object({
    total: z.number(),
    dimensions: z.array(matchDimensionSchema),
  }),
  reviewCount: z.number().int().nonnegative(),
  dataInsufficient: z.boolean(),
  /** 平滑后的用户选择率 0–1，供卡片展示与弱匹配 */
  selectionRate: z.number().min(0).max(1),
  /** 供推荐卡片引用的评价原文摘录 */
  reviewExcerpts: z.array(z.string().min(1)).max(3),
  analysis: analyzeInsightSchema.nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

export type AnalyzeCandidate = z.infer<typeof analyzeCandidateSchema>;

/** 推荐生成模型输出，与 lib/prompts.ts 锁死的 JSON 一致 */
export const recommendResultSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            merchant: z.string().min(1),
            reason: z.string().min(1),
            notes: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    gap: z.union([z.string(), z.null()]),
  })
  .strict();

export type RecommendResult = z.infer<typeof recommendResultSchema>;

/** POST /api/recommend 入参；追问时带 previous + messages */
export const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const recommendRequestSchema = z.object({
  needs: parseNeedSchema,
  candidates: z.array(analyzeCandidateSchema).min(1).max(CANDIDATE_LIMIT),
  previous: recommendResultSchema.optional(),
  messages: z.array(chatTurnSchema).max(16).optional(),
});

export type RecommendRequest = z.infer<typeof recommendRequestSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;

export const insightRequestSchema = z.object({
  merchantId: z.string().min(1),
});

export const sessionMerchantSchema = z.object({
  id: z.string().min(1),
  rank: z.number().int().min(1).max(3),
});

/** POST /api/session：推荐成功后记下本轮曝光 */
export const sessionRequestSchema = z.object({
  sessionId: z.string().min(1).max(64),
  needs: parseNeedSchema,
  merchants: z.array(sessionMerchantSchema).max(3),
});

export const choiceSourceSchema = z.enum(["card", "search"]);

/** POST /api/choice：确认本轮去了哪家 */
export const choiceRequestSchema = z.object({
  sessionId: z.string().min(1).max(64),
  merchantId: z.string().min(1),
  source: choiceSourceSchema,
});

export type ChoiceSource = z.infer<typeof choiceSourceSchema>;
