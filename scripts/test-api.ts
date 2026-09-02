/**
 * 临时脚本：验证 DeepSeek API 是否可用。
 *
 * 任选其一：
 *   cd my-demo && node scripts/test-api.ts
 *   node my-demo/scripts/test-api.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chatJSON } from "../lib/deepseek.ts";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");

/** 把 my-demo/.env.local 读进 process.env，不依赖当前工作目录 */
function loadEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) {
    throw new Error(
      `找不到 ${envPath}，请确保 my-demo/.env.local 已配置 DEEPSEEK_API_KEY`,
    );
  }

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      throw new Error(`.env.local 存在无法解析的行：${line}`);
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  // chatJSON 走 JSON 模式，必须在 prompt 里要求输出 JSON
  const result = await chatJSON([
    {
      role: "system",
      content: '请用 JSON 回复，格式：{"reply":"你的回复内容"}',
    },
    { role: "user", content: "你好" },
  ]);

  console.log("DeepSeek API 可用，返回结果：");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error("DeepSeek API 验证失败：");
  console.error(error);
  process.exitCode = 1;
});
