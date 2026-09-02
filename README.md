# 探店参谋

说出你想怎么吃，从评价里找出该去哪家。

线上演示：[https://spot-aide.vercel.app](https://spot-aide.vercel.app)

选餐厅时，人往往不是缺信息，而是被评价淹没：要翻几十上百条才能拼出「适不适合今晚这顿」。探店参谋把这句话反过来——先听懂需求，再进评价里做语义分析和匹配，给出可解释的 Top 3，而不是再堆一页列表。

模型在这里是分析师，不是聊天机器人。它不凭空点名餐厅，只对库里的评价做抽取、打分和对照。

## 项目介绍

这是一个可演示的本地生活决策 Demo：用户用自然语言描述场景（例如「带 4 岁小孩，预算 200，想吃粤菜，要有包间」），系统解析成结构化标签，从 50 家模拟商家、约 1266 条评价中做匹配与语义分析，返回推荐理由、避坑提醒，并允许追问和切换商户视角。

**做了什么**

- 自然语言需求 → 场景、预算、菜系、口味、氛围、设施等标签，可在确认页改
- 对候选店的评价做五维分析（口味 / 环境 / 服务 / 性价比 / 场景适配），抽出正面标签和风险信号
- 规则匹配 + 硬需求拦截（包间、安静、指定菜系、辣/不辣），再由模型写推荐理由和注意事项
- 结果页可追问（「第一家有没有适合小孩的？」），回答必须落在已有评价上
- 可切换商户视角，看这家店评价里顾客在意什么
- 「我就去这家」记下本轮选择；选择率由评价先验和实际曝光/选择平滑得到

**数据说明**

商家和评价是按真实探店评价的结构造的种子数据：上海商圈、口语化正文、少量错别字，情感大约 6:3:1（正/中/负）。没有接入美团或大众点评接口。分析和推荐链路是真的：DeepSeek 实时解析与生成，选择记录会写入数据库。

正式接入真实评价源时，产品和模型链路可以沿用，主要换成数据质量和时效。

## 技术架构

| 层 | 选型 | 作用 |
| --- | --- | --- |
| 界面 | Next.js 16（App Router）+ React 19 + Tailwind CSS 4 | 首页 / 确认 / 结果 / 感谢；移动端适配、骨架屏、空态与错误态 |
| API | `app/api/*` Route Handler | 解析、分析、推荐（SSE）、洞察、搜店、场次、选择 |
| 模型 | DeepSeek（`deepseek-v4-flash`） | 统一走 `lib/deepseek.ts`：JSON 模式 + 流式推荐 |
| 校验 | zod | 请求体和模型 JSON 先过 schema，再进业务 |
| 匹配 | `lib/matching.ts` + `lib/recommend-guard.ts` | 加权打分；硬需求冲突的店不能靠文案圆进推荐 |
| 数据 | Prisma 6 + SQLite（本地）/ Turso（线上） | 商家、评价、标签、推荐场次、曝光与选择 |

调用模型只发生在用户走解析、出推荐、追问或打开商户洞察时。打开首页、只读静态页不会消耗 token。

### 请求链路

```
首页输入 / 场景模板
    → POST /api/parse          需求 → 结构化标签
    → 确认页（可改标签）
    → POST /api/analyze        候选店 + 评价语义分析
    → POST /api/recommend      SSE 生成 Top 3 理由与避坑
    → POST /api/session        记下本轮曝光
    → 结果页追问 / 商户洞察 / 「我就去这家」
    → POST /api/choice         每轮只确认一家
    → 感谢页
```

推荐生成前会把候选分成可推荐和不可推荐。包间、安静、指定菜系、口味等硬需求对不上时，店不会出现在卡片里，差距写进 `gap`。评价不足 5 条会降低先验选择率，并在注意事项里提示数据不够。

### 目录

```
app/            页面与 API
components/     界面组件
lib/            模型封装、Prompt、匹配、选择率、校验
prisma/         数据模型和迁移
scripts/        种子数据、Turso 同步、联调脚本
```

本地连 `prisma/dev.db`。线上 Vercel 文件系统只读，配了 `TURSO_DATABASE_URL` 与 `TURSO_AUTH_TOKEN` 后走 Turso。

## 产品设计思路

### 要解决的问题

到店决策的痛点不是「找不到店」，而是「评价看不完」。用户带着模糊约束（安静、带小孩、别太辣），平台给的是按热度排的评价流，总结工作仍在人身上。

产品把流程收成三步：说人话 → 读评价 → 给决策。

### 为什么不是对话框套一层

差异在数据层。模型不能自己发明一家店，必须先对库存评价做分析，再解释「为什么是这三家」。理由要求对着评价说；评价没写的，追问里要明确说没提到，建议到店确认。

### 对模型边界的处理

| 风险 | 做法 |
| --- | --- |
| 幻觉 | Prompt 要求基于评价、禁止编造；推荐理由应对得上分析里的标签和风险 |
| 硬需求被圆场 | 规则层先拦截，禁止「虽然吵但仍适合安静」这类表述 |
| 数据不足 | 评价少的店降权，并提示仅供参考 |
| 解析失败 / 无候选 | 不给空白页，用可重试的错误态或空态，引导放宽条件 |
| 被当成官方分 | 结果页用「AI 分析说明」标明结论来自评价语义，不是平台评分 |

### 排序在想什么

匹配权重偏向菜系、预算、设施和口味，选择率只做弱加权，避免「大家都点过」压过「今晚要包间」。选择率先验来自评分、好评占比和负面标签；线上有曝光和选择后再平滑，避免刚上线时 0 除或剧烈跳动。

### 怎么判断好不好

演示阶段更关心这几件事是否成立：需求有没有被解对、推荐能不能追溯到评价、硬需求会不会被圆进去、用户最后能不能做出一个选择。线上用「我就去这家」观察采纳，而不是只看模型是否输出了三段漂亮文案。

## 本地运行

需要 Node.js 20+。Prisma 请用项目里的 `6.19.x`（`./node_modules/.bin/prisma`），不要 `npx prisma`，以免拉到不兼容的大版本。

```bash
cd my-demo
npm install
```

在项目根复制环境变量并填入 DeepSeek 密钥：

```bash
cp .env.example .env.local
```

`.env.local` 至少包含：

```
DEEPSEEK_API_KEY=你的密钥
DATABASE_URL="file:./prisma/dev.db"
```

初始化本地库并写入 50 家店：

```bash
./node_modules/.bin/prisma migrate deploy
npm run db:seed
```

启动：

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

可选：`npm test` 跑匹配、选择率等单测。

本地不配 Turso 变量时走 SQLite。只有要把数据推到线上库时才需要 `TURSO_*` 并执行 `npm run db:sync-turso`。

## 部署地址

生产环境：[https://spot-aide.vercel.app](https://spot-aide.vercel.app)

线上环境变量：

- `DEEPSEEK_API_KEY`：模型调用
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`：读写商家、场次和选择
- `DATABASE_URL`：构建时给 Prisma 的占位（本地 sqlite 路径即可）
- 
产品需求文档：见 [docs/prd.md](docs/prd.md)。核心 Prompt 迭代：见 [docs/prompt-iteration.md](docs/prompt-iteration.md)。模拟数据设计：见 [docs/data-design.md](docs/data-design.md)。竞品分析（点评 AI / 小红书 / 小团）：见 [docs/competitive-analysis.md](docs/competitive-analysis.md)。高保真原型（HTML，可导入 Figma / Axure）：见 [docs/prototype/](docs/prototype/)。
