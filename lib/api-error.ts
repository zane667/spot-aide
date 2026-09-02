import { NextResponse } from "next/server";

export type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_INPUT"
  | "MISSING_API_KEY"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INVALID_MODEL_OUTPUT"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export function fail(code: ErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function formatZodIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "body";
      return `${path}: ${issue.message}`;
    })
    .join("；");
}

export function failFromUnknown(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("DEEPSEEK_API_KEY")) {
    return fail("MISSING_API_KEY", "服务器未配置 DEEPSEEK_API_KEY", 500);
  }
  if (message.includes("请求超时") || message.includes("Timeout")) {
    return fail("UPSTREAM_TIMEOUT", "DeepSeek 请求超时，请稍后重试", 504);
  }
  if (message.includes("JSON 模式输出无法解析") || message.includes("响应体不是合法 JSON")) {
    return fail("INVALID_MODEL_OUTPUT", `模型返回不是合法 JSON：${message}`, 502);
  }
  if (message.includes("DeepSeek API 请求失败") || message.includes("DeepSeek 请求失败")) {
    return fail("UPSTREAM_ERROR", message, 502);
  }
  if (
    message.includes("readonly database") ||
    message.includes("attempt to write a readonly database")
  ) {
    return fail(
      "INTERNAL_ERROR",
      "线上数据库不可写。请配置 TURSO_DATABASE_URL 与 TURSO_AUTH_TOKEN 后重新部署。",
      500,
    );
  }

  return fail("INTERNAL_ERROR", message, 500);
}
