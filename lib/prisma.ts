import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

function tursoConfig(): { url: string; authToken: string } | null {
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!url || !authToken) {
    return null;
  }
  return { url, authToken };
}

/** Next 运行时 cwd 是项目根，把相对路径钉到 prisma/dev.db */
function resolveLocalDatabaseUrl(): string {
  const existing = process.env.DATABASE_URL;
  if (existing && !existing.startsWith("file:./")) {
    return existing;
  }
  const dbFile = resolve(process.cwd(), "prisma", "dev.db");
  if (!existsSync(dbFile)) {
    throw new Error(`找不到 SQLite 文件 ${dbFile}，请先 migrate 并执行 seed`);
  }
  return `file:${dbFile}`;
}

/** 有 TURSO_* 时走 libSQL；否则连本地 sqlite。Vercel 只读文件系统必须用前者。 */
export function createPrismaClient(): PrismaClient {
  const turso = tursoConfig();
  if (turso) {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = "file:./prisma/dev.db";
    }
    const adapter = new PrismaLibSQL({
      url: turso.url,
      authToken: turso.authToken,
    });
    return new PrismaClient({ adapter });
  }

  process.env.DATABASE_URL = resolveLocalDatabaseUrl();
  return new PrismaClient();
}

const globalForPrisma = globalThis as { prisma?: PrismaClient };

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** 延迟建连：脚本可先 loadProjectEnv，Next 打包时也不会读 import.meta.dirname */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
