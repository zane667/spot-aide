# 项目约定
- 技术栈：Next.js 14（App Router）+ TypeScript + Tailwind CSS + Prisma + SQLite（本地）/ Turso（线上）
- 目录规范：API 路由放 app/api/，业务逻辑放 lib/，数据脚本放 scripts/，组件放 components/
- 风格：函数组件；中文注释；错误处理完整，禁止吞掉异常
- API 返回统一用 zod 校验；调用 DeepSeek 统一走 lib/deepseek.ts
- 文档：开发过程中不要主动起草 PRD / Prompt 迭代 / 竞品分析等面试文档；等用户在项目总结时明确要求再写

## 收尾时 Prompt 设计文档的写法（先记思路，届时再起草）
- `lib/prompts.ts` 只保留线上最终版；迭代过程单独成文，不把历史 Prompt 堆进代码
- 三个 Prompt 各写一节：需求解析、评价语义分析、推荐生成
- 每一节结构：V1（失败）→ 现象 → 原因 → 改动点 → 再测 → 最终版
- 每一轮至少记录：输入用例、模型实际输出、哪里不行、改了 Prompt 哪一句
- 用固定测试句 + 种子库评价对比 V1 / 终版；最终 JSON 用 zod 校验，解析失败算失败
- 面试口述：最短 Prompt 跑通 → 字段乱 / 非 JSON / 推荐无引用 → 每轮只改一类问题 → 结论可溯源
