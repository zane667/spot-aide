import { HOT_PICK_LIMIT, buildHomeLenses, rankHotPicks, type HomeLens, type HotPick } from "./hot-picks.ts";
import { prisma } from "./prisma";

async function loadMerchantRows() {
  return prisma.merchant.findMany({
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
}

export async function loadHotPicks(limit: number = HOT_PICK_LIMIT): Promise<HotPick[]> {
  const rows = await loadMerchantRows();
  return rankHotPicks(rows, limit);
}

export async function loadHomeLenses(now: Date = new Date()): Promise<HomeLens[]> {
  const rows = await loadMerchantRows();
  return buildHomeLenses(rows, now);
}
