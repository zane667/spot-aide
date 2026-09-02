import { fail, failFromUnknown, formatZodIssues } from "@/lib/api-error";
import { chatJSON } from "@/lib/deepseek";
import { PARSE_NEED_SYSTEM, fillPrompt } from "@/lib/prompts";
import { parseNeedSchema, parseRequestSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return fail(
      "INVALID_JSON",
      error instanceof Error ? `请求体不是合法 JSON：${error.message}` : "请求体不是合法 JSON",
      400,
    );
  }

  const input = parseRequestSchema.safeParse(body);
  if (!input.success) {
    return fail("INVALID_INPUT", formatZodIssues(input.error), 400);
  }

  let raw: unknown;
  try {
    raw = await chatJSON([
      {
        role: "system",
        content: fillPrompt(PARSE_NEED_SYSTEM, { query: input.data.query }),
      },
      {
        role: "user",
        content: "请严格按 System Prompt 输出 JSON，不要输出其它文字。",
      },
    ]);
  } catch (error) {
    return failFromUnknown(error);
  }

  const parsed = parseNeedSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "INVALID_MODEL_OUTPUT",
      `模型返回字段不合法：${formatZodIssues(parsed.error)}`,
      502,
    );
  }

  return NextResponse.json({ ok: true, data: parsed.data });
}
