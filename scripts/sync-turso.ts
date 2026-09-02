/**
 * 把 Prisma schema 推到 Turso，并在空库时写入种子商家。
 *
 *   cd my-demo && node scripts/sync-turso.ts
 *
 * 需要 .env.local：TURSO_DATABASE_URL、TURSO_AUTH_TOKEN。
 * Prisma CLI 仍用本地 sqlite 的 DATABASE_URL 生成 SQL，不会直连 Turso。
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { PROJECT_ROOT, requireTursoEnv } from "../lib/load-env.ts";

function generateSchemaSql(): string {
  const prismaCli = resolve(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      resolve(PROJECT_ROOT, "prisma", "schema.prisma"),
      "--script",
    ],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || result.stdout?.trim() || "prisma migrate diff 失败",
    );
  }
  const sql = result.stdout.trim();
  if (!sql) {
    throw new Error("prisma migrate diff 没有输出 SQL");
  }
  return sql;
}

async function applySchema(url: string, authToken: string, sql: string): Promise<void> {
  const client = createClient({ url, authToken });
  try {
    const existing = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='Merchant'",
    );
    if (existing.rows.length > 0) {
      console.log("Turso 已有 Merchant 表，跳过建表。");
      return;
    }
    await client.executeMultiple(sql);
    console.log("Turso schema 已写入。");
  } finally {
    client.close();
  }
}

async function main(): Promise<void> {
  const turso = requireTursoEnv();
  console.log("正在从 Prisma schema 生成 SQL…");
  const sql = generateSchemaSql();
  await applySchema(turso.url, turso.authToken, sql);

  console.log("正在写入种子数据…");
  const seed = spawnSync(process.execPath, [resolve(PROJECT_ROOT, "scripts", "seed-data.ts")], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (seed.status !== 0) {
    throw new Error("种子写入失败");
  }
}

main().catch((error: unknown) => {
  console.error("同步 Turso 失败：");
  console.error(error);
  process.exitCode = 1;
});
