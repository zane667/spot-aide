import { parseNeedSchema, type ParseNeed } from "./schemas";

const STORAGE_KEY = "探店参谋:needs";

export function saveNeed(needs: ParseNeed): void {
  const parsed = parseNeedSchema.safeParse(needs);
  if (!parsed.success) {
    throw new Error("无法保存需求：字段不合法");
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
}

export function loadNeed(): ParseNeed | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error("本地缓存的需求不是合法 JSON", { cause: error });
  }
  const parsed = parseNeedSchema.safeParse(json);
  if (!parsed.success) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return parsed.data;
}

const SESSION_ID_KEY = "探店参谋:recommendSessionId";
const SESSION_NEEDS_KEY = "探店参谋:recommendSessionNeeds";

/** 同一轮需求复用 sessionId，避免开发态 Strict Mode 重复记曝光 */
export function getOrCreateRecommendSessionId(needs: ParseNeed): string {
  const needsKey = JSON.stringify(needs);
  const storedNeeds = sessionStorage.getItem(SESSION_NEEDS_KEY);
  const storedId = sessionStorage.getItem(SESSION_ID_KEY);
  if (storedId && storedNeeds === needsKey) {
    return storedId;
  }
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_ID_KEY, created);
  sessionStorage.setItem(SESSION_NEEDS_KEY, needsKey);
  return created;
}
