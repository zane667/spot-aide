import type { ParseNeed } from "./schemas";

export type NeedTagKey = Exclude<keyof ParseNeed, "inference">;

export interface NeedTagField {
  key: NeedTagKey;
  label: string;
  format: (value: string | number) => string;
}

export const NEED_TAG_FIELDS: NeedTagField[] = [
  { key: "scene", label: "场景", format: (value) => String(value) },
  {
    key: "budget",
    label: "人均",
    format: (value) => {
      const text = String(value);
      return text.includes("人均") ? text : `人均${text}`;
    },
  },
  { key: "cuisine", label: "菜系", format: (value) => String(value) },
  { key: "taste", label: "口味", format: (value) => String(value) },
  { key: "atmosphere", label: "氛围", format: (value) => String(value) },
  { key: "facility", label: "设施", format: (value) => String(value) },
  { key: "crowd", label: "人数", format: (value) => `${value}人` },
  { key: "time", label: "时间", format: (value) => String(value) },
  { key: "location", label: "位置", format: (value) => String(value) },
];

export function tagValue(needs: ParseNeed, key: NeedTagKey): string | number | null {
  return needs[key];
}

/** 把用户改过的标签写回 ParseNeed；空字符串视为清除 */
export function writeTagValue(
  needs: ParseNeed,
  key: NeedTagKey,
  raw: string,
): ParseNeed {
  const trimmed = raw.trim();
  if (key === "crowd") {
    if (trimmed === "") {
      return { ...needs, crowd: null };
    }
    const digits = trimmed.replace(/[^\d-]/g, "");
    const crowd = Number.parseInt(digits, 10);
    if (Number.isNaN(crowd)) {
      throw new Error("人数必须是数字");
    }
    return { ...needs, crowd };
  }

  if (trimmed === "") {
    return { ...needs, [key]: null };
  }

  let next = trimmed;
  if (key === "budget") {
    next = next.replace(/^人均\s*/, "");
  }
  return { ...needs, [key]: next };
}
