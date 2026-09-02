import Link from "next/link";
import type { ReactNode } from "react";

export interface StatusAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface StatusPanelProps {
  kind: "error" | "empty";
  title: string;
  message: string;
  primary?: StatusAction;
  secondary?: StatusAction;
  /** 嵌在卡片、列表里时用紧凑样式 */
  compact?: boolean;
}

function ActionButton({
  action,
  variant,
}: {
  action: StatusAction;
  variant: "primary" | "secondary";
}) {
  const className =
    variant === "primary"
      ? "inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink transition hover:brightness-95"
      : "inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-neutral-600 underline-offset-2 hover:underline";

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  if (!action.onClick) {
    throw new Error(`操作「${action.label}」既没有 href 也没有 onClick`);
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export function StatusPanel({
  kind,
  title,
  message,
  primary,
  secondary,
  compact = false,
}: StatusPanelProps) {
  const actions: ReactNode =
    primary || secondary ? (
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-3" : "mt-5 justify-center"}`}>
        {primary ? <ActionButton action={primary} variant="primary" /> : null}
        {secondary ? <ActionButton action={secondary} variant="secondary" /> : null}
      </div>
    ) : null;

  if (compact) {
    return (
      <div
        role={kind === "error" ? "alert" : "status"}
        className="rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-black/5"
      >
        <p className="text-sm font-medium text-neutral-800">{title}</p>
        <p className={`mt-1 text-sm leading-6 break-words ${kind === "error" ? "text-red-600" : "text-neutral-500"}`}>
          {message}
        </p>
        {actions}
      </div>
    );
  }

  return (
    <section
      role={kind === "error" ? "alert" : "status"}
      className="flex w-full min-w-0 flex-col items-center rounded-3xl bg-white px-5 py-8 text-center shadow-[0_8px_28px_rgba(26,26,26,0.06)] ring-1 ring-black/5"
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink">
        探
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{title}</h2>
      <p
        className={`mt-2 max-w-sm text-sm leading-6 break-words ${kind === "error" ? "text-red-600" : "text-neutral-500"}`}
      >
        {message}
      </p>
      {actions}
    </section>
  );
}
