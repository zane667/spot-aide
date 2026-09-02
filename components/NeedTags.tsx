"use client";

import { NEED_TAG_FIELDS, tagValue, writeTagValue, type NeedTagKey } from "@/lib/need-tags";
import type { ParseNeed } from "@/lib/schemas";
import { useEffect, useRef, useState } from "react";

interface NeedTagsProps {
  needs: ParseNeed;
  onChange: (next: ParseNeed) => void;
}

export function NeedTags({ needs, onChange }: NeedTagsProps) {
  const [editing, setEditing] = useState<NeedTagKey | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const active = NEED_TAG_FIELDS.filter((field) => tagValue(needs, field.key) !== null);
  const unused = NEED_TAG_FIELDS.filter((field) => tagValue(needs, field.key) === null);

  function startEdit(key: NeedTagKey, initial: string): void {
    setError(null);
    setEditing(key);
    setDraft(initial);
  }

  function commit(): void {
    if (!editing) {
      return;
    }
    try {
      onChange(writeTagValue(needs, editing, draft));
      setError(null);
      setEditing(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {active.map((field) => {
          const value = tagValue(needs, field.key);
          if (value === null) {
            return null;
          }
          if (editing === field.key) {
            return (
              <input
                key={field.key}
                ref={inputRef}
                value={draft}
                aria-label={`修改${field.label}`}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  }
                  if (event.key === "Escape") {
                    setEditing(null);
                  }
                }}
                className="max-w-full min-w-0 w-[min(11rem,100%)] rounded-full bg-white px-3 py-1.5 text-base ring-2 ring-brand outline-none sm:text-sm"
              />
            );
          }
          return (
            <button
              key={field.key}
              type="button"
              onClick={() => startEdit(field.key, String(value))}
              className="max-w-full min-h-9 break-words rounded-full bg-brand/80 px-3.5 py-1.5 text-sm font-medium text-brand-ink transition hover:bg-brand"
            >
              {field.format(value)}
            </button>
          );
        })}
        {active.length === 0 && editing === null ? (
          <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500 ring-1 ring-black/5">
            还没有解析出标签，点下面补充一条
          </p>
        ) : null}
      </div>

      {unused.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {unused.map((field) =>
            editing === field.key ? (
              <input
                key={field.key}
                ref={inputRef}
                value={draft}
                aria-label={`添加${field.label}`}
                placeholder={field.label}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  }
                  if (event.key === "Escape") {
                    setEditing(null);
                  }
                }}
                className="max-w-full min-w-0 w-[min(11rem,100%)] rounded-full bg-white px-3 py-1.5 text-base ring-2 ring-brand outline-none sm:text-sm"
              />
            ) : (
              <button
                key={field.key}
                type="button"
                onClick={() => startEdit(field.key, "")}
                className="min-h-9 rounded-full px-3 py-1.5 text-sm text-neutral-500 ring-1 ring-dashed ring-neutral-300 hover:bg-white hover:text-neutral-700"
              >
                + {field.label}
              </button>
            ),
          )}
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
