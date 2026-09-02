import { fail, failFromUnknown } from "@/lib/api-error";
import { loadHotPicks } from "@/lib/load-hot-picks";
import { prisma } from "@/lib/prisma";
import { smoothedSelectionRate } from "@/lib/selection-rate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const sort = url.searchParams.get("sort")?.trim() ?? "";

  if (sort === "selectionRate") {
    const rawLimit = url.searchParams.get("limit") ?? "3";
    const limit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 6) {
      return fail("INVALID_INPUT", "limit 必须是 1–6 的整数", 400);
    }
    try {
      const merchants = await loadHotPicks(limit);
      return NextResponse.json({ ok: true, data: { merchants } });
    } catch (error) {
      return failFromUnknown(error);
    }
  }

  if (query.length === 0) {
    return NextResponse.json({ ok: true, data: { merchants: [] } });
  }
  if (query.length > 40) {
    return fail("INVALID_INPUT", "搜索关键词不能超过 40 字", 400);
  }

  try {
    const rows = await prisma.merchant.findMany({
      where: { name: { contains: query } },
      orderBy: { name: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        cuisine: true,
        district: true,
        avgPrice: true,
        priorRate: true,
        impressions: true,
        selections: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        merchants: rows.map((row) => ({
          id: row.id,
          name: row.name,
          cuisine: row.cuisine,
          district: row.district,
          avgPrice: row.avgPrice,
          selectionRate: smoothedSelectionRate({
            priorRate: row.priorRate,
            impressions: row.impressions,
            selections: row.selections,
          }),
        })),
      },
    });
  } catch (error) {
    return failFromUnknown(error);
  }
}
