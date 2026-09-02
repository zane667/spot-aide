import { fail, failFromUnknown, formatZodIssues } from "@/lib/api-error";
import { chatJSON } from "@/lib/deepseek";
import { ANALYZE_REVIEWS_SYSTEM, fillPrompt } from "@/lib/prompts";
import { prisma } from "@/lib/prisma";
import { analyzeInsightSchema, insightRequestSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

  const input = insightRequestSchema.safeParse(body);
  if (!input.success) {
    return fail("INVALID_INPUT", formatZodIssues(input.error), 400);
  }

  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: input.data.merchantId },
      include: {
        reviews: {
          orderBy: { publishedAt: "desc" },
          take: 20,
          select: { rating: true, content: true, sentiment: true },
        },
      },
    });

    if (!merchant) {
      return fail("INVALID_INPUT", "商家不存在", 404);
    }
    if (merchant.reviews.length === 0) {
      return fail("INVALID_INPUT", `商家「${merchant.name}」没有评价，无法分析`, 400);
    }

    const raw = await chatJSON([
      {
        role: "system",
        content: fillPrompt(ANALYZE_REVIEWS_SYSTEM, {
          reviews: formatReviews(
            merchant.name,
            merchant.district,
            merchant.cuisine,
            merchant.avgPrice,
            merchant.reviews,
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
      return fail(
        "INVALID_MODEL_OUTPUT",
        `经营洞察字段不合法：${formatZodIssues(parsed.error)}`,
        502,
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        merchant: {
          id: merchant.id,
          name: merchant.name,
          cuisine: merchant.cuisine,
          avgPrice: merchant.avgPrice,
          district: merchant.district,
        },
        analysis: parsed.data,
        view: {
          care_about: parsed.data.top_tags,
          complaint_focus: parsed.data.risk_signals,
          advantage: parsed.data.best_for,
          watch_out: parsed.data.avoid_if,
        },
      },
    });
  } catch (error) {
    return failFromUnknown(error);
  }
}
