import { fail, failFromUnknown, formatZodIssues } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sessionRequestSchema } from "@/lib/schemas";
import { smoothedSelectionRate } from "@/lib/selection-rate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function ratePayload(row: {
  id: string;
  name: string;
  priorRate: number;
  impressions: number;
  selections: number;
}) {
  return {
    id: row.id,
    name: row.name,
    selectionRate: smoothedSelectionRate({
      priorRate: row.priorRate,
      impressions: row.impressions,
      selections: row.selections,
    }),
  };
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

  const input = sessionRequestSchema.safeParse(body);
  if (!input.success) {
    return fail("INVALID_INPUT", formatZodIssues(input.error), 400);
  }

  const uniqueMerchants = new Map<string, number>();
  for (const item of input.data.merchants) {
    if (!uniqueMerchants.has(item.id)) {
      uniqueMerchants.set(item.id, item.rank);
    }
  }

  try {
    const existing = await prisma.recommendSession.findUnique({
      where: { id: input.data.sessionId },
      include: {
        choice: true,
        impressions: { include: { merchant: true } },
      },
    });

    if (existing) {
      const chosen = existing.choice
        ? await prisma.merchant.findUnique({ where: { id: existing.choice.merchantId } })
        : null;
      const merchants = existing.impressions.map((row) => ratePayload(row.merchant));
      return NextResponse.json({
        ok: true,
        data: {
          sessionId: existing.id,
          alreadyRecorded: true,
          choice: existing.choice
            ? {
                merchantId: existing.choice.merchantId,
                name: chosen?.name ?? "",
                source: existing.choice.source,
              }
            : null,
          merchants,
        },
      });
    }

    const merchantIds = [...uniqueMerchants.keys()];
    const found = await prisma.merchant.findMany({
      where: { id: { in: merchantIds } },
    });
    if (found.length !== merchantIds.length) {
      const foundIds = new Set(found.map((row) => row.id));
      const missing = merchantIds.filter((id) => !foundIds.has(id));
      return fail("NOT_FOUND", `这些商家不在库内：${missing.join("、")}`, 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.recommendSession.create({
        data: {
          id: input.data.sessionId,
          needsJson: JSON.stringify(input.data.needs),
          impressions: {
            create: merchantIds.map((id) => ({
              merchantId: id,
              rank: uniqueMerchants.get(id) ?? null,
            })),
          },
        },
      });
      for (const id of merchantIds) {
        await tx.merchant.update({
          where: { id },
          data: { impressions: { increment: 1 } },
        });
      }
    });

    const updated = await prisma.merchant.findMany({
      where: { id: { in: merchantIds } },
    });
    const byId = new Map(updated.map((row) => [row.id, row]));

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: input.data.sessionId,
        alreadyRecorded: false,
        choice: null,
        merchants: merchantIds.map((id) => {
          const row = byId.get(id);
          if (!row) {
            throw new Error(`曝光写入后找不到商家 ${id}`);
          }
          return ratePayload(row);
        }),
      },
    });
  } catch (error) {
    return failFromUnknown(error);
  }
}
