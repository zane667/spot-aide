/**
 * 种子脚本：写入 50 家模拟商家及真人风格评价。
 *
 *   cd my-demo && node scripts/seed-data.ts
 *   node my-demo/scripts/seed-data.ts
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Sentiment } from "@prisma/client";
import { createPrismaClient } from "../lib/prisma.ts";
import { computePriorRate } from "../lib/selection-rate.ts";
import {
  isTursoConfigured,
  loadProjectEnv,
  PROJECT_ROOT,
} from "../lib/load-env.ts";

const SEED = 20260831;
const MERCHANT_COUNT = 50;
const REVIEW_MIN = 20;
const REVIEW_MAX = 30;

interface District {
  name: string;
  streets: string[];
}

interface CuisinePlan {
  cuisine: string;
  count: number;
  minPrice: number;
  maxPrice: number;
  suffix: string;
}

interface BuiltReview {
  rating: number;
  content: string;
  publishedAt: Date;
  sentiment: Sentiment;
  tags: string[];
}

/** 固定种子 PRNG，方便复现同一批模拟数据 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pick() 不能接收空数组");
  }
  return items[Math.floor(rng() * items.length)]!;
}

function intBetween(rng: () => number, min: number, max: number): number {
  if (max < min) {
    throw new Error(`intBetween 区间非法：${min}..${max}`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }
  return copy;
}

/** 读取 .env / .env.local，不覆盖已有环境变量 */
const DISTRICTS: District[] = [
  { name: "徐家汇", streets: ["漕溪北路", "衡山路", "肇嘉浜路"] },
  { name: "静安寺", streets: ["南京西路", "愚园路", "延安中路"] },
  { name: "五角场", streets: ["淞沪路", "邯郸路", "翔殷路"] },
  { name: "陆家嘴", streets: ["世纪大道", "浦东南路", "富城路"] },
  { name: "人民广场", streets: ["南京东路", "西藏中路", "九江路"] },
  { name: "中山公园", streets: ["长宁路", "定西路", "武夷路"] },
  { name: "虹桥", streets: ["延安西路", "古北路", "仙霞路"] },
  { name: "田子坊", streets: ["泰康路", "瑞金二路", "建国中路"] },
  { name: "七宝", streets: ["新镇路", "漕宝路", "吴中路"] },
  { name: "世纪公园", streets: ["锦绣路", "花木路", "芳甸路"] },
];

const CUISINE_PLANS: CuisinePlan[] = [
  { cuisine: "火锅", count: 8, minPrice: 88, maxPrice: 168, suffix: "火锅" },
  { cuisine: "川菜", count: 7, minPrice: 58, maxPrice: 128, suffix: "川菜馆" },
  { cuisine: "粤菜", count: 6, minPrice: 98, maxPrice: 228, suffix: "粤菜" },
  { cuisine: "日料", count: 6, minPrice: 128, maxPrice: 268, suffix: "料理" },
  { cuisine: "烧烤", count: 5, minPrice: 68, maxPrice: 128, suffix: "烧烤" },
  { cuisine: "西餐", count: 4, minPrice: 158, maxPrice: 328, suffix: "餐厅" },
  { cuisine: "本帮菜", count: 4, minPrice: 88, maxPrice: 188, suffix: "本帮菜" },
  { cuisine: "湘菜", count: 3, minPrice: 58, maxPrice: 118, suffix: "湘菜馆" },
  { cuisine: "韩餐", count: 3, minPrice: 78, maxPrice: 148, suffix: "韩餐" },
  { cuisine: "家常菜", count: 4, minPrice: 48, maxPrice: 98, suffix: "小馆" },
];

const BRANDS = [
  "巷口", "渔火", "阿婆", "老边", "顺德", "蜀九香", "夜未央", "山海间", "烟火气", "弄堂",
  "金桂", "清欢", "半山", "南苑", "北岸", "西街", "东门", "暖锅", "鲜码头", "小满",
  "味正", "福记", "喜乐", "一品", "三更", "四季", "五味", "六里", "八方", "九号",
  "青石", "白玉", "红灯笼", "绿杨", "紫藤", "墨香", "竹园", "梅坞", "兰亭", "菊舍",
  "桃源", "柳岸", "松间", "柏树", "槐花", "梧桐", "石库门", "外滩边", "城隍庙", "南京路",
] as const;

const TYPOS: ReadonlyArray<readonly [string, string]> = [
  ["味道", "味到"],
  ["环境", "环镜"],
  ["推荐", "推见"],
  ["特别", "特比"],
  ["排队", "排对"],
  ["服务", "服物"],
  ["不错", "不措"],
  ["好吃", "好次"],
  ["位置", "位至"],
  ["新鲜", "新仙"],
];

const POSITIVE_SNIPPETS: Record<string, string[]> = {
  火锅: [
    "毛肚很脆，锅底香但不算特别燥，配了两扎冰的很过瘾",
    "可以选微辣，带父母来也吃得动，有包间还安静",
    "牛肉卷新鲜，服务员会提醒煮多久，体验挺细",
  ],
  川菜: [
    "水煮鱼量足，麻味正宗但不至于吃不了，配米饭绝了",
    "宫保鸡丁很家常，辣椒用得克制，适合不太能吃辣的朋友",
    "回锅肉肥瘦合适，蒜苗很香，点了两碗米饭还不够",
  ],
  粤菜: [
    "白切鸡皮脆肉嫩，蘸料很正，清淡但有味道",
    "蒸点出品稳，虾饺皮薄，周末早茶要早点来",
    "有包间，适合家庭聚餐，煲汤喝完还想续",
  ],
  日料: [
    "刺身很新鲜，三文鱼油脂够，醋饭也刚刚好",
    "寿司师傅手速快，位置靠窗还安静，适合约会",
    "鳗鱼饭酱汁不甜腻，米饭粒粒分开，会再来",
  ],
  烧烤: [
    "羊肉串外焦里嫩，孜然给得刚好，配啤酒绝配",
    "烤茄子流油，韭菜串也香，夜市那味儿出来了",
    "可以拼盘，朋友聚餐很方便，服务员换炭挺勤快",
  ],
  西餐: [
    "牛排七分熟掌握得准，汁水足，配红酒很合适",
    "灯光暗、座位疏，适合约会，说话不用大声",
    "意面酱很浓，面包篮会续，仪式感拉满",
  ],
  本帮菜: [
    "红烧肉入口即化，甜度上海人能接受，外地朋友也说好",
    "腌笃鲜很鲜，春笋脆，汤底不油，适合带长辈",
    "糖醋小排酸甜平衡，份量实在，米饭必备",
  ],
  湘菜: [
    "口味虾香辣过瘾，剥起来麻烦但值，配冰可乐",
    "农家小炒肉辣椒很香，不是纯辣，下饭到停不下来",
    "蒸菜很入味，可以点微辣，服务员会问能吃多辣",
  ],
  韩餐: [
    "五花肉烤盘干净，生菜新鲜，包起来很爽",
    "冷面酸甜正好，解腻，饭后还想再来一碗",
    "部队锅料很足，年糕芝士拉丝，冬天来太幸福",
  ],
  家常菜: [
    "像家里炒的，青菜清爽，鱼香肉丝不甜腻",
    "价格实在，两个人点三个菜刚好，能停车",
    "老板人好，米饭管够，适合平时随便吃一顿",
  ],
};

const GENERIC_POSITIVE = [
  "环境干净，座位间距还行，不会特别吵",
  "停车比较方便，找了半天居然有地下车库",
  "服务员态度好，上菜也快，体验很顺",
  "性价比可以，这个价位值了，会推给同事",
  "适合周末家庭聚餐，小孩也有得吃",
];

const NEUTRAL_SNIPPETS = [
  "味道还行吧，中规中矩，不会惊艳也不会翻车",
  "环境一般，有点吵，聊天要提高音量",
  "上菜速度普通，等位大概十几分钟，能接受",
  "份量中等，两个大人吃刚好，吃货可能会不够",
  "位置好找，但周末人多，想安静就别这时候来",
  "有的菜很赞有的一般，总体还行，值回票价一半吧",
  "停车要绕一下，不是特别方便，地铁倒是近",
  "服务没什么槽点也没什么亮点，正常水平",
  "装修过得去，灯光有点暗，拍照一般",
  "价格偏一点，味道配得上但不会特意安利",
];

const NEGATIVE_SNIPPETS = [
  "等位太久了，说二十分钟结果快一小时，有点崩",
  "菜品分量少，这个价位有点不值，吃完还想再点外卖",
  "服务态度一般，喊了两次才来，水也不肯及时续",
  "油烟味重，衣服上都是，出来还得换衣服的程度",
  "有个菜明显不新鲜，不敢再点海鲜了",
  "空调不太行，坐里面又闷又吵，呆不久",
  "停车难到想骂人，转了两圈只能停老远",
  "辣度标了微辣结果还是很冲，带父母来不太合适",
];

const POSITIVE_TAGS = ["口味正宗", "环境好", "适合约会", "适合家庭", "有包间", "停车方便", "性价比高", "安静", "上菜快"];
const NEUTRAL_TAGS = ["中规中矩", "人多", "位置好找", "份量一般"];
const NEGATIVE_TAGS = ["等位久", "分量少", "服务差", "太吵", "性价比低", "停车难"];

function roundPrice(value: number): number {
  return Math.round(value / 2) * 2;
}

function applyTypo(rng: () => number, content: string): string {
  const candidates = TYPOS.filter(([from]) => content.includes(from));
  if (candidates.length === 0 || rng() > 0.18) {
    return content;
  }
  const [from, to] = pick(rng, candidates);
  return content.replace(from, to);
}

function addColloquial(rng: () => number, content: string, sentiment: Sentiment): string {
  const prefixes = {
    positive: ["真的可以啊，", "跟朋友随便点的，", "路过试了一下，", "第二次来了，"],
    neutral: ["说实话，", "一般般吧，", "吃过一次，", "不算雷，"],
    negative: ["有点无语，", "不太建议，", "踩了个坑，", "下次不会来了，"],
  }[sentiment];
  const suffixes = {
    positive: [" 嗯，还会再来。", " 推一个。", " 值。", " 收藏了。"],
    neutral: [" 就这样。", " 看心情吧。", " 中规中矩。", ""],
    negative: [" 避雷。", " 失望。", " 不太值。", " 慎重。"],
  }[sentiment];
  return `${pick(rng, prefixes)}${content}${pick(rng, suffixes)}`;
}

function buildSentimentList(rng: () => number, total: number): Sentiment[] {
  const negativeCount = Math.max(1, Math.round(total * 0.1));
  const neutralCount = Math.round(total * 0.3);
  let positiveCount = total - negativeCount - neutralCount;
  if (positiveCount < 1) {
    positiveCount = 1;
  }
  const list: Sentiment[] = [
    ...Array<Sentiment>(positiveCount).fill("positive"),
    ...Array<Sentiment>(neutralCount).fill("neutral"),
    ...Array<Sentiment>(negativeCount).fill("negative"),
  ];
  while (list.length < total) {
    list.push("positive");
  }
  return shuffle(rng, list.slice(0, total));
}

function ratingFor(rng: () => number, sentiment: Sentiment): number {
  if (sentiment === "positive") {
    return rng() < 0.55 ? 5 : 4;
  }
  if (sentiment === "neutral") {
    return 3;
  }
  return rng() < 0.5 ? 2 : 1;
}

function tagsFor(rng: () => number, sentiment: Sentiment, content: string): string[] {
  const pool =
    sentiment === "positive"
      ? POSITIVE_TAGS
      : sentiment === "neutral"
        ? NEUTRAL_TAGS
        : NEGATIVE_TAGS;
  const selected = new Set<string>();
  const extra = ["有包间", "停车方便", "适合约会", "适合家庭", "安静", "等位久", "太吵"].filter(
    (tag) => content.includes(tag.slice(0, 2)) || content.includes(tag),
  );
  for (const tag of extra) {
    selected.add(tag);
  }
  const need = intBetween(rng, 1, 3);
  while (selected.size < need) {
    selected.add(pick(rng, pool));
  }
  return [...selected];
}

function buildReviewContent(
  rng: () => number,
  cuisine: string,
  sentiment: Sentiment,
): string {
  if (sentiment === "positive") {
    const specific = POSITIVE_SNIPPETS[cuisine];
    if (!specific) {
      throw new Error(`缺少菜系「${cuisine}」的正面评价模板`);
    }
    const parts = [pick(rng, specific), pick(rng, GENERIC_POSITIVE)];
    return applyTypo(rng, addColloquial(rng, parts.join("，"), sentiment));
  }
  const pool = sentiment === "neutral" ? NEUTRAL_SNIPPETS : NEGATIVE_SNIPPETS;
  const first = pick(rng, pool);
  let second = pick(rng, pool);
  if (second === first) {
    second = pick(rng, pool);
  }
  return applyTypo(rng, addColloquial(rng, `${first}。${second}`, sentiment));
}

function publishedAt(rng: () => number, now: Date): Date {
  const daysAgo = intBetween(rng, 0, 180);
  const hours = intBetween(rng, 10, 21);
  const minutes = intBetween(rng, 0, 59);
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function expandCuisineSlots(): CuisinePlan[] {
  const total = CUISINE_PLANS.reduce((sum, plan) => sum + plan.count, 0);
  if (total !== MERCHANT_COUNT) {
    throw new Error(`菜系配额合计 ${total}，与商家数 ${MERCHANT_COUNT} 不一致`);
  }
  const slots: CuisinePlan[] = [];
  for (const plan of CUISINE_PLANS) {
    for (let i = 0; i < plan.count; i += 1) {
      slots.push(plan);
    }
  }
  return slots;
}

function buildMerchants(rng: () => number): Array<{
  name: string;
  cuisine: string;
  avgPrice: number;
  address: string;
  district: string;
  reviews: BuiltReview[];
}> {
  if (BRANDS.length < MERCHANT_COUNT) {
    throw new Error(`品牌词不足 ${MERCHANT_COUNT} 个，无法生成不重名商家`);
  }
  const brands = shuffle(rng, [...BRANDS]);
  const cuisineSlots = shuffle(rng, expandCuisineSlots());
  const now = new Date();
  const merchants = [];

  for (let i = 0; i < MERCHANT_COUNT; i += 1) {
    const plan = cuisineSlots[i]!;
    const district = DISTRICTS[i % DISTRICTS.length]!;
    const street = pick(rng, district.streets);
    const no = intBetween(rng, 18, 886);
    const reviewCount = intBetween(rng, REVIEW_MIN, REVIEW_MAX);
    const sentiments = buildSentimentList(rng, reviewCount);
    const reviews: BuiltReview[] = sentiments.map((sentiment) => {
      const content = buildReviewContent(rng, plan.cuisine, sentiment);
      return {
        rating: ratingFor(rng, sentiment),
        content,
        publishedAt: publishedAt(rng, now),
        sentiment,
        tags: tagsFor(rng, sentiment, content),
      };
    });

    merchants.push({
      name: `${brands[i]}${plan.suffix}`,
      cuisine: plan.cuisine,
      avgPrice: roundPrice(intBetween(rng, plan.minPrice, plan.maxPrice)),
      address: `${district.name}${street}${no}号`,
      district: district.name,
      reviews,
    });
  }

  return merchants;
}

async function seed(): Promise<void> {
  loadProjectEnv();
  const usingTurso = isTursoConfigured();
  if (!usingTurso) {
    const dbFile = resolve(PROJECT_ROOT, "prisma", "dev.db");
    if (!existsSync(dbFile)) {
      throw new Error(`找不到数据库文件 ${dbFile}，请先执行 prisma migrate`);
    }
    process.env.DATABASE_URL = `file:${dbFile}`;
  }

  const prisma = createPrismaClient();
  const rng = createRng(SEED);

  try {
    if (usingTurso && process.env.FORCE_SEED !== "1") {
      const existingCount = await prisma.merchant.count();
      if (existingCount > 0) {
        console.log(
          `Turso 已有 ${existingCount} 家店，跳过种子。FORCE_SEED=1 可强制重写。`,
        );
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userChoice.deleteMany();
      await tx.recommendImpression.deleteMany();
      await tx.recommendSession.deleteMany();
      await tx.tag.deleteMany();
      await tx.review.deleteMany();
      await tx.merchant.deleteMany();
    });

    const merchants = buildMerchants(rng);
    for (const merchant of merchants) {
      await prisma.merchant.create({
        data: {
          name: merchant.name,
          cuisine: merchant.cuisine,
          avgPrice: merchant.avgPrice,
          address: merchant.address,
          district: merchant.district,
          priorRate: computePriorRate(
            merchant.reviews.map((review) => ({
              rating: review.rating,
              sentiment: review.sentiment,
              tagNames: review.tags,
            })),
          ),
          reviews: {
            create: merchant.reviews.map((review) => ({
              rating: review.rating,
              content: review.content,
              publishedAt: review.publishedAt,
              sentiment: review.sentiment,
              tags: {
                create: review.tags.map((name) => ({ name })),
              },
            })),
          },
        },
      });
    }

    const [merchantCount, reviewCount, tagCount, sentimentGroups] = await Promise.all([
      prisma.merchant.count(),
      prisma.review.count(),
      prisma.tag.count(),
      prisma.review.groupBy({
        by: ["sentiment"],
        _count: { _all: true },
      }),
    ]);

    if (merchantCount !== MERCHANT_COUNT) {
      throw new Error(`写入后商家数为 ${merchantCount}，期望 ${MERCHANT_COUNT}`);
    }

    const sentimentMap = Object.fromEntries(
      sentimentGroups.map((row) => [row.sentiment, row._count._all]),
    ) as Record<string, number>;
    const positive = sentimentMap.positive ?? 0;
    const neutral = sentimentMap.neutral ?? 0;
    const negative = sentimentMap.negative ?? 0;

    console.log("种子数据写入完成：");
    console.log(`商家数：${merchantCount}`);
    console.log(`评价总数：${reviewCount}`);
    console.log(`标签数：${tagCount}`);
    console.log(
      `情感分布：positive ${positive} / neutral ${neutral} / negative ${negative}（约 ${positive}:${neutral}:${negative}）`,
    );
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("写入种子数据失败", { cause: error });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error) {
      throw new Error("Prisma disconnect 失败", { cause: error });
    }
  }
}

seed().catch((error: unknown) => {
  console.error("种子脚本执行失败：");
  console.error(error);
  process.exitCode = 1;
});
