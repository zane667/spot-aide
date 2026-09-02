import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envDir = typeof import.meta.dirname === "string" ? import.meta.dirname : process.cwd();
export const PROJECT_ROOT = resolve(envDir, typeof import.meta.dirname === "string" ? ".." : ".");

/** 脚本不走 Next 的 env 加载；Next 已注入的 key 不会被覆盖 */
export function loadProjectEnv(): void {
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

export function isTursoConfigured(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL?.trim() && process.env.TURSO_AUTH_TOKEN?.trim(),
  );
}

export function requireTursoEnv(): { url: string; authToken: string } {
  loadProjectEnv();
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!url || !authToken) {
    throw new Error(
      "未配置 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN。在 https://app.turso.tech 建库后写入 .env.local，并同步到 Vercel 环境变量。",
    );
  }
  return { url, authToken };
}
