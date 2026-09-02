/**
 * 用 20 条需求用例跑 Prompt，校验返回 JSON 与必填字段。
 *
 *   cd my-demo && node scripts/test-prompts.ts
 *   node scripts/test-prompts.ts --only=analyze
 *   node scripts/test-prompts.ts --only=parse --limit=5
 *
 * 全量约 43 次调用（20 解析 + 3 评价分析 + 20 推荐），比三轮各 20 次更省额度。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { chatJSON } from "../lib/deepseek.ts";
import {
  ANALYZE_REVIEWS_SYSTEM,
  PARSE_NEED_SYSTEM,
  RECOMMEND_SYSTEM,
  fillPrompt,
} from "../lib/prompts.ts";
import { analyzeInsightSchema, parseNeedSchema } from "../lib/schemas.ts";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");

interface CaseSpec {
  id: string;
  kind: "常规" | "模糊" | "空字段" | "极端预算";
  query: string;
}

interface PromptCheck {
  prompt: "需求解析" | "评价分析" | "推荐生成";
  ok: boolean;
  issues: string[];
  raw: unknown;
}

const CASES: CaseSpec[] = [
  { id: "01", kind: "常规", query: "带4岁小孩，预算200，想吃粤菜，要有包间" },
  { id: "02", kind: "常规", query: "周末约会，要安静，人均150到200" },
  { id: "03", kind: "常规", query: "同事聚餐，火锅，最好能停车" },
  { id: "04", kind: "常规", query: "家庭聚餐带父母，不要太辣，有包间" },
  { id: "05", kind: "常规", query: "工作日晚上独食，日料，预算300" },
  { id: "06", kind: "常规", query: "五角场附近烧烤，今晚" },
  { id: "07", kind: "常规", query: "商务宴请，安静，人均500以上，粤菜" },
  { id: "08", kind: "常规", query: "团建25人，人均80，热闹一点" },
  { id: "09", kind: "常规", query: "周末午餐，地铁站附近，清淡" },
  { id: "10", kind: "常规", query: "只要有包间和停车，别的无所谓" },
  { id: "11", kind: "模糊", query: "一个人随便吃" },
  { id: "12", kind: "模糊", query: "附近有什么好吃的" },
  { id: "13", kind: "模糊", query: "随便" },
  { id: "14", kind: "模糊", query: "想吃但不知道吃什么，两个人，徐家汇" },
  { id: "15", kind: "模糊", query: "不要辣不要香菜不要蒜，预算随便" },
  { id: "16", kind: "空字段", query: "" },
  { id: "17", kind: "空字段", query: "吃" },
  { id: "18", kind: "极端预算", query: "人均10块钱也要吃顿好的" },
  { id: "19", kind: "极端预算", query: "人均2000，要最贵的日料，要私密包间" },
  { id: "20", kind: "极端预算", query: "预算0，越便宜越好" },
];

type OnlyMode = "all" | "parse" | "analyze" | "recommend";

const recommendSchema = z
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

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function parseOnly(): OnlyMode {
  const value = readArg("only") ?? "all";
  if (value === "all" || value === "parse" || value === "analyze" || value === "recommend") {
    return value;
  }
  throw new Error(`--only 只能是 all | parse | analyze | recommend，收到：${value}`);
}

function parseLimit(fallback: number): number {
  const raw = readArg("limit");
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--limit 必须是正整数，收到：${raw}`);
  }
  return value;
}

function loadEnvFiles(): void {
  for (const fileName of [".env", ".env.local"]) {
    const envPath = resolve(PROJECT_ROOT, fileName);
    if (!existsSync(envPath)) {
      continue;
    }
    const text = readFileSync(envPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const eq = line.indexOf("=");
      if (eq <= 0) {
        throw new Error(`${fileName} 存在无法解析的行：${line}`);
      }
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function printRaw(label: string, raw: unknown): void {
  console.log(`--- ${label} 原始返回 ---`);
  if (typeof raw === "string") {
    console.log(raw);
    return;
  }
  try {
    console.log(JSON.stringify(raw, null, 2));
  } catch (error) {
    throw new Error("无法序列化原始返回", { cause: error });
  }
}

function issuesFromZod(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

async function callPrompt(system: string): Promise<unknown> {
  return chatJSON([
    { role: "system", content: system },
    { role: "user", content: "请严格按 System Prompt 输出 JSON，不要输出其它文字。" },
  ]);
}

function validate(
  prompt: PromptCheck["prompt"],
  schema: z.ZodType<unknown>,
  raw: unknown,
): PromptCheck {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { prompt, ok: true, issues: [], raw };
  }
  return { prompt, ok: false, issues: issuesFromZod(parsed.error), raw };
}

async function runOnePrompt(
  prompt: PromptCheck["prompt"],
  system: string,
  schema: z.ZodType<unknown>,
): Promise<PromptCheck> {
  try {
    const raw = await callPrompt(system);
    const check = validate(prompt, schema, raw);
    if (!check.ok) {
      console.log(`  ✗ ${prompt} 字段不合法：${check.issues.join("；")}`);
      printRaw(prompt, raw);
    } else {
      console.log(`  ✓ ${prompt} JSON 合法且字段齐全`);
    }
    return check;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ ${prompt} 调用或 JSON 解析失败：${message}`);
    printRaw(prompt, message);
    if (error instanceof Error && error.cause) {
      console.log("  cause:", error.cause);
    }
    return { prompt, ok: false, issues: [message], raw: message };
  }
}

type MerchantRow = {
  name: string;
  cuisine: string;
  avgPrice: number;
  district: string;
  reviews: Array<{ rating: number; content: string; sentiment: string }>;
};

function formatReviews(merchant: MerchantRow): string {
  if (merchant.reviews.length === 0) {
    throw new Error(`商家「${merchant.name}」没有评价`);
  }
  const lines = merchant.reviews.map(
    (review, index) =>
      `${index + 1}. [${review.sentiment}/${review.rating}分] ${review.content}`,
  );
  return `商家：${merchant.name}（${merchant.district} / ${merchant.cuisine} / 人均${merchant.avgPrice}）\n${lines.join("\n")}`;
}

async function loadMerchants(prisma: PrismaClient): Promise<MerchantRow[]> {
  const merchants = await prisma.merchant.findMany({
    take: 3,
    include: {
      reviews: {
        take: 8,
        orderBy: { publishedAt: "desc" },
        select: { rating: true, content: true, sentiment: true },
      },
    },
  });
  if (merchants.length === 0) {
    throw new Error("没有可用于评价分析的商家，请先运行 scripts/seed-data.ts");
  }
  return merchants;
}

async function runAnalyses(
  merchants: MerchantRow[],
  limit: number,
): Promise<PromptCheck[]> {
  const targets = merchants.slice(0, Math.min(limit, merchants.length));
  const checks: PromptCheck[] = [];
  for (const [index, merchant] of targets.entries()) {
    console.log(`\n[评价分析 ${index + 1}/${targets.length}] ${merchant.name}`);
    const check = await runOnePrompt(
      "评价分析",
      fillPrompt(ANALYZE_REVIEWS_SYSTEM, { reviews: formatReviews(merchant) }),
      analyzeInsightSchema,
    );
    checks.push(check);
  }
  return checks;
}

async function main(): Promise<void> {
  if (CASES.length !== 20) {
    throw new Error(`用例数应为 20，实际 ${CASES.length}`);
  }

  const only = parseOnly();
  const limit = parseLimit(only === "analyze" ? 3 : 20);
  const cases = CASES.slice(0, only === "analyze" ? CASES.length : limit);

  loadEnvFiles();
  const dbFile = resolve(PROJECT_ROOT, "prisma", "dev.db");
  if (!existsSync(dbFile)) {
    throw new Error(`找不到 ${dbFile}，请先 migrate 并执行 seed`);
  }
  process.env.DATABASE_URL = `file:${dbFile}`;

  const prisma = new PrismaClient();
  const checks: PromptCheck[] = [];
  let analyzeChecks: PromptCheck[] = [];
  let merchants: MerchantRow[] = [];

  try {
    if (only !== "parse") {
      merchants = await loadMerchants(prisma);
    }

    if (only === "analyze") {
      analyzeChecks = await runAnalyses(merchants, limit);
      checks.push(...analyzeChecks);
    } else if (only === "all" || only === "recommend") {
      console.log("\n先按店各跑 1 次评价分析（共 3 家），结果复用给推荐。");
      analyzeChecks = await runAnalyses(merchants, 3);
      checks.push(...analyzeChecks);
    }

    const merchantAnalyses = JSON.stringify(
      merchants.map((merchant, index) => ({
        name: merchant.name,
        cuisine: merchant.cuisine,
        avgPrice: merchant.avgPrice,
        district: merchant.district,
        analysis: analyzeChecks[index]?.raw ?? null,
        analysis_ok: analyzeChecks[index]?.ok ?? false,
      })),
    );

    if (only !== "analyze") {
      for (const [index, spec] of cases.entries()) {
        console.log(
          `\n[${index + 1}/${cases.length}] ${spec.kind} #${spec.id} 「${spec.query || "(空字符串)"}」`,
        );

        let parseCheck: PromptCheck | undefined;
        if (only === "all" || only === "parse") {
          parseCheck = await runOnePrompt(
            "需求解析",
            fillPrompt(PARSE_NEED_SYSTEM, { query: spec.query }),
            parseNeedSchema,
          );
          checks.push(parseCheck);
        }

        if (only === "all" || only === "recommend") {
          const userNeeds = parseCheck?.ok
            ? JSON.stringify(parseCheck.raw)
            : JSON.stringify({
                scene: null,
                budget: null,
                cuisine: null,
                taste: null,
                atmosphere: null,
                facility: null,
                crowd: null,
                time: null,
                location: null,
                inference: "测试脚本在仅测推荐时使用占位需求",
              });
          const recommendCheck = await runOnePrompt(
            "推荐生成",
            fillPrompt(RECOMMEND_SYSTEM, {
              user_needs: userNeeds,
              merchant_analyses: merchantAnalyses,
            }),
            recommendSchema,
          );
          checks.push(recommendCheck);
        }
      }
    }
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error) {
      throw new Error("Prisma disconnect 失败", { cause: error });
    }
  }

  const failed = checks.filter((item) => !item.ok);
  const byPrompt = {
    需求解析: checks.filter((item) => item.prompt === "需求解析"),
    评价分析: checks.filter((item) => item.prompt === "评价分析"),
    推荐生成: checks.filter((item) => item.prompt === "推荐生成"),
  };

  console.log("\n======== 汇总 ========");
  for (const [name, list] of Object.entries(byPrompt)) {
    if (list.length === 0) {
      continue;
    }
    const pass = list.filter((item) => item.ok).length;
    console.log(`${name}：${pass}/${list.length} 通过`);
  }
  console.log(`合计：${checks.length - failed.length}/${checks.length} 通过`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Prompt 测试脚本失败：");
  console.error(error);
  process.exitCode = 1;
});
