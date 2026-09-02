/**
 * 用现有评价回填商家先验选择率，不重建 50 家店。
 *
 *   cd my-demo && node scripts/seed-prior-rate.ts
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createPrismaClient } from "../lib/prisma.ts";
import { priorRateFromMerchantReviews } from "../lib/selection-rate.ts";
import {
  isTursoConfigured,
  loadProjectEnv,
  PROJECT_ROOT,
} from "../lib/load-env.ts";

async function main(): Promise<void> {
  loadProjectEnv();
  if (!isTursoConfigured()) {
    const dbFile = resolve(PROJECT_ROOT, "prisma", "dev.db");
    if (!existsSync(dbFile)) {
      throw new Error(`找不到数据库文件 ${dbFile}，请先执行 prisma migrate`);
    }
    process.env.DATABASE_URL = `file:${dbFile}`;
  }

  const prisma = createPrismaClient();
  try {
    const merchants = await prisma.merchant.findMany({
      include: {
        reviews: {
          select: {
            rating: true,
            sentiment: true,
            tags: { select: { name: true } },
          },
        },
      },
    });
    if (merchants.length === 0) {
      throw new Error("库内没有商家，请先执行 node scripts/seed-data.ts");
    }

    for (const merchant of merchants) {
      const priorRate = priorRateFromMerchantReviews(merchant.reviews);
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { priorRate },
      });
    }

    const sample = await prisma.merchant.findMany({
      select: { name: true, priorRate: true },
      orderBy: { priorRate: "desc" },
      take: 5,
    });
    console.log(`已为 ${merchants.length} 家店写入先验选择率。最高的 5 家：`);
    for (const row of sample) {
      console.log(`  ${row.name}  ${(row.priorRate * 100).toFixed(1)}%`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("回填先验选择率失败：");
  console.error(error);
  process.exitCode = 1;
});
