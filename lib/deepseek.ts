/**
 * DeepSeek Chat Completions 统一封装。
 * 业务代码禁止直接请求 DeepSeek，一律走本文件。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const REQUEST_TIMEOUT_MS = 30_000;

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatCompletionChoice {
  delta?: { content?: string | null };
  message?: { content?: string | null };
  finish_reason?: string | null;
}

interface ChatCompletionPayload {
  choices?: ChatCompletionChoice[];
}

/** 读取密钥；缺失时直接抛错，避免带着空 Authorization 发出请求 */
function getApiKey(): string {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("缺少环境变量 DEEPSEEK_API_KEY，无法调用 DeepSeek");
  }
  return apiKey;
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function throwRequestError(error: unknown): never {
  if (isTimeoutError(error)) {
    throw new Error(`DeepSeek 请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`, {
      cause: error,
    });
  }
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("DeepSeek 请求失败", { cause: error });
}

/** 发起 Chat Completions；整个请求（含流式读取）受 30 秒超时约束 */
async function requestChatCompletions(
  body: Record<string, unknown>,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        // 关闭思考模式：Demo 需要稳定 JSON / 及时流式正文，避免推理占满超时
        thinking: { type: "disabled" },
        ...body,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throwRequestError(error);
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).trim();
    } catch (error) {
      throw new Error(`DeepSeek API 请求失败：HTTP ${response.status}，且无法读取错误正文`, {
        cause: error,
      });
    }
    throw new Error(
      `DeepSeek API 请求失败：HTTP ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }

  return response;
}

function assertMessages(messages: ChatMessage[], caller: string): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error(`${caller} 的 messages 不能为空`);
  }
}

/** 从 SSE 缓冲区拆出完整 data 行，未完成的半行留在 rest */
function splitSseDataLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  const lines: string[] = [];

  for (const raw of parts) {
    const line = raw.trim();
    if (!line || !line.startsWith("data:")) {
      continue;
    }
    lines.push(line.slice("data:".length).trim());
  }

  return { lines, rest };
}

function contentFromSseData(data: string): string | null {
  if (data === "[DONE]") {
    return null;
  }

  let payload: ChatCompletionPayload;
  try {
    payload = JSON.parse(data) as ChatCompletionPayload;
  } catch (error) {
    throw new Error(`DeepSeek 流式分片不是合法 JSON：${data.slice(0, 200)}`, {
      cause: error,
    });
  }

  const content = payload.choices?.[0]?.delta?.content;
  return typeof content === "string" && content.length > 0 ? content : "";
}

/**
 * 流式调用 DeepSeek，返回文本增量 ReadableStream。
 * 调用方需自行消费流；超时或解析失败会通过 stream.error 抛出。
 */
export async function chatStream(
  messages: ChatMessage[],
): Promise<ReadableStream<string>> {
  assertMessages(messages, "chatStream");

  const response = await requestChatCompletions({
    messages,
    stream: true,
  });

  if (!response.body) {
    throw new Error("DeepSeek 流式响应缺少 body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<string>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const leftover = buffer.trim();
            if (leftover && leftover !== "[DONE]" && !leftover.startsWith("data: [DONE]")) {
              const { lines } = splitSseDataLines(`${buffer}\n`);
              for (const line of lines) {
                const chunk = contentFromSseData(line);
                if (chunk) {
                  controller.enqueue(chunk);
                }
              }
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = splitSseDataLines(buffer);
          buffer = rest;

          let enqueued = false;
          for (const line of lines) {
            if (line === "[DONE]") {
              controller.close();
              await reader.cancel();
              return;
            }
            const chunk = contentFromSseData(line);
            if (chunk) {
              controller.enqueue(chunk);
              enqueued = true;
            }
          }

          if (enqueued) {
            return;
          }
        }
      } catch (error) {
        try {
          await reader.cancel();
        } catch (cancelError) {
          throw new Error("DeepSeek 流式读取失败，且取消 reader 时再次出错", {
            cause: { readError: error, cancelError },
          });
        }
        throwRequestError(error);
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });
}

function extractMessageContent(payload: ChatCompletionPayload): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("DeepSeek 响应缺少 message.content");
  }
  return content;
}

/**
 * 非流式调用，要求模型输出 JSON，并解析后返回。
 * 调用方仍须在 prompt 中明确要求输出 JSON（DeepSeek JSON 模式的硬性要求）。
 */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
): Promise<T> {
  assertMessages(messages, "chatJSON");

  const response = await requestChatCompletions({
    messages,
    stream: false,
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  let payload: ChatCompletionPayload;
  try {
    payload = (await response.json()) as ChatCompletionPayload;
  } catch (error) {
    throw new Error("DeepSeek 返回的响应体不是合法 JSON", { cause: error });
  }

  const content = extractMessageContent(payload);

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`DeepSeek JSON 模式输出无法解析：${content.slice(0, 200)}`, {
      cause: error,
    });
  }
}

/** 在请求体里关闭思考模式，避免推理占满超时 */
async function fetchWithoutThinking(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.thinking === undefined) {
        parsed.thinking = { type: "disabled" };
      }
      return await fetch(input, { ...init, body: JSON.stringify(parsed) });
    } catch {
      return await fetch(input, init);
    }
  }
  return await fetch(input, init);
}

function getStreamModel() {
  return createOpenAI({
    name: "deepseek",
    baseURL: DEEPSEEK_BASE_URL,
    apiKey: getApiKey(),
    fetch: fetchWithoutThinking,
  }).chat(DEFAULT_MODEL);
}

function encodeSse(payload: unknown): Uint8Array {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

/** AI SDK 7 禁止 messages 里带 system，改走 instructions */
function splitForStreamText(messages: ChatMessage[]): {
  instructions?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const rest: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    rest.push({ role: message.role, content: message.content });
  }

  if (rest.length === 0) {
    throw new Error("chatSSE 除 system 外至少需要一条 user 消息");
  }

  return {
    instructions: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: rest,
  };
}

function sseErrorPayload(error: unknown): { error: { code: string; message: string } } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    error: {
      code: isTimeoutError(error) ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
      message: isTimeoutError(error)
        ? `DeepSeek 请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`
        : message,
    },
  };
}

/**
 * 用 Vercel AI SDK 的 streamText 调 DeepSeek，返回 SSE 字节流。
 * 每个增量：data: {"delta":"..."}；结束：data: [DONE]
 */
export async function chatSSE(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  assertMessages(messages, "chatSSE");
  getApiKey();

  const prompt = splitForStreamText(messages);
  let streamError: unknown;

  const result = streamText({
    model: getStreamModel(),
    instructions: prompt.instructions,
    messages: prompt.messages,
    temperature: 0.2,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    onError({ error }) {
      streamError = error;
    },
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let emitted = false;
        for await (const part of result.stream) {
          if (part.type === "text-delta" && part.text.length > 0) {
            controller.enqueue(encodeSse({ delta: part.text }));
            emitted = true;
            continue;
          }
          if (part.type === "error") {
            throw part.error;
          }
        }
        if (streamError) {
          throw streamError;
        }
        if (!emitted) {
          throw new Error("DeepSeek 流式响应没有产生任何文本");
        }
        controller.enqueue(encodeSse("[DONE]"));
        controller.close();
      } catch (error) {
        controller.enqueue(encodeSse(sseErrorPayload(error)));
        controller.enqueue(encodeSse("[DONE]"));
        controller.close();
      }
    },
  });
}
