import { fail, failFromUnknown, formatZodIssues } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { choiceRequestSchema } from "@/lib/schemas";
import { smoothedSelectionRate } from "@/lib/selection-rate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

  const input = choiceRequestSchema.safeParse(body);
  if (!input.success) {
    return fail("INVALID_INPUT", formatZodIssues(input.error), 400);
  }

  try {
    const session = await prisma.recommendSession.findUnique({
      where: { id: input.data.sessionId },
      include: { choice: true },
    });
    if (!session) {
      return fail("NOT_FOUND", "推荐场次不存在，请重新找店后再确认去向", 404);
    }
    if (session.choice) {
      return fail("CONFLICT", "这一轮已经记过你去了哪家，不能再改", 409);
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: input.data.merchantId },
    });
    if (!merchant) {
      return fail("NOT_FOUND", "只能选择数据库里已有的商家", 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.userChoice.create({
        data: {
          sessionId: input.data.sessionId,
          merchantId: input.data.merchantId,
          source: input.data.source,
        },
      });
      const seen = await tx.recommendImpression.findUnique({
        where: {
          sessionId_merchantId: {
            sessionId: input.data.sessionId,
            merchantId: input.data.merchantId,
          },
        },
      });
      if (!seen) {
        await tx.recommendImpression.create({
          data: {
            sessionId: input.data.sessionId,
            merchantId: input.data.merchantId,
            rank: null,
          },
        });
      }
      return tx.merchant.update({
        where: { id: input.data.merchantId },
        data: seen
          ? { selections: { increment: 1 } }
          : { selections: { increment: 1 }, impressions: { increment: 1 } },
      });
    });

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: input.data.sessionId,
        merchantId: updated.id,
        name: updated.name,
        source: input.data.source,
        selectionRate: smoothedSelectionRate({
          priorRate: updated.priorRate,
          impressions: updated.impressions,
          selections: updated.selections,
        }),
      },
    });
  } catch (error) {
    return failFromUnknown(error);
  }
}
