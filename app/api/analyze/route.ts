import { fail, failFromUnknown, formatZodIssues } from "@/lib/api-error";
import { chatJSON } from "@/lib/deepseek";
import { rankMerchants, type MerchantSnapshot } from "@/lib/matching";
import { ANALYZE_REVIEWS_SYSTEM, fillPrompt } from "@/lib/prompts";
import { prisma } from "@/lib/prisma";
import { smoothedSelectionRate } from "@/lib/selection-rate";
import {
  CANDIDATE_LIMIT,
  REVIEW_INSUFFICIENT_THRESHOLD,
  analyzeInsightSchema,
  analyzeRequestSchema,
  type AnalyzeInsight,
} from "@/lib/schemas";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function pickReviewExcerpts(
  reviews: Array<{ rating: number; content: string }>,
): string[] {
  const excerpts: string[] = [];
  const ordered = [...reviews].sort((left, right) => right.rating - left.rating);
  for (const review of ordered) {
    const text = review.content.trim();
    if (text.length < 8) {
      continue;
    }
    excerpts.push(text.length > 56 ? `${text.slice(0, 56)}…` : text);
    if (excerpts.length >= 2) {
      break;
    }
  }
  return excerpts;
}

function formatReviews(
  name: string,
  district: string,
  cuisine: string,
  avgPrice: number,
  reviews: Array<{ rating: number; content: string; sentiment: string }>,
): string {
  const lines = reviews.map(
    (review, index) =>
      `${index + 1}. [${review.sentiment}/${review.rating}分] ${review.content}`,
  );
  return `商家：${name}（${district} / ${cuisine} / 人均${avgPrice}）\n${lines.join("\n")}`;
}

async function analyzeMerchant(
  snapshot: MerchantSnapshot,
  reviews: Array<{ rating: number; content: string; sentiment: string }>,
): Promise<AnalyzeInsight> {
  if (reviews.length === 0) {
    throw new Error(`商家「${snapshot.name}」没有评价，无法分析`);
  }
  const raw = await chatJSON([
    {
      role: "system",
      content: fillPrompt(ANALYZE_REVIEWS_SYSTEM, {
        reviews: formatReviews(
          snapshot.name,
          snapshot.district,
          snapshot.cuisine,
          snapshot.avgPrice,
          reviews,
        ),
      }),
    },
    {
      role: "user",
      content: "请严格按 System Prompt 输出 JSON，不要输出其它文字。",
    },
  ]);
  const parsed = analyzeInsightSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `商家「${snapshot.name}」评价分析字段不合法：${formatZodIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return fail(
      "INVALID_JSON",
      error instanceof Error ? `请求体不是合法 JSON：${error.message}` : "请求体不是合法 JSON",
      400,
    );
  }

  const input = analyzeRequestSchema.safeParse(body);
  if (!input.success) {
    return fail("INVALID_INPUT", formatZodIssues(input.error), 400);
  }

  try {
    const rows = await prisma.merchant.findMany({
      include: {
        reviews: {
          orderBy: { publishedAt: "desc" },
          take: 20,
          select: {
            rating: true,
            content: true,
            sentiment: true,
            tags: { select: { name: true } },
          },
        },
      },
    });

    const snapshots: MerchantSnapshot[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      cuisine: row.cuisine,
      avgPrice: row.avgPrice,
      address: row.address,
      district: row.district,
      tagNames: [...new Set(row.reviews.flatMap((review) => review.tags.map((tag) => tag.name)))],
      selectionRate: smoothedSelectionRate({
        priorRate: row.priorRate,
        impressions: row.impressions,
        selections: row.selections,
      }),
    }));

    const ranked = rankMerchants(input.data, snapshots).slice(0, CANDIDATE_LIMIT);
    const candidates = [];

    for (const item of ranked) {
      const row = rows.find((merchant) => merchant.id === item.merchant.id);
      if (!row) {
        throw new Error(`匹配结果中的商家 ${item.merchant.id} 在查询结果里不存在`);
      }
      const reviewCount = row.reviews.length;
      const dataInsufficient = reviewCount < REVIEW_INSUFFICIENT_THRESHOLD;
      try {
        const analysis = await analyzeMerchant(item.merchant, row.reviews);
        candidates.push({
          merchant: {
            id: row.id,
            name: row.name,
            cuisine: row.cuisine,
            avgPrice: row.avgPrice,
            address: row.address,
            district: row.district,
          },
          match: {
            total: Math.round(item.total * 1000) / 10,
            dimensions: item.dimensions,
          },
          reviewCount,
          dataInsufficient,
          selectionRate: smoothedSelectionRate({
            priorRate: row.priorRate,
            impressions: row.impressions,
            selections: row.selections,
          }),
          reviewExcerpts: pickReviewExcerpts(row.reviews),
          analysis,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        candidates.push({
          merchant: {
            id: row.id,
            name: row.name,
            cuisine: row.cuisine,
            avgPrice: row.avgPrice,
            address: row.address,
            district: row.district,
          },
          match: {
            total: Math.round(item.total * 1000) / 10,
            dimensions: item.dimensions,
          },
          reviewCount,
          dataInsufficient,
          selectionRate: smoothedSelectionRate({
            priorRate: row.priorRate,
            impressions: row.impressions,
            selections: row.selections,
          }),
          reviewExcerpts: pickReviewExcerpts(row.reviews),
          analysis: null,
          error: { code: "INVALID_MODEL_OUTPUT", message },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        candidateCount: candidates.length,
        candidates,
      },
    });
  } catch (error) {
    return failFromUnknown(error);
  }
}
