const STEPS = [
  {
    step: "1",
    title: "说人话",
    detail: "场景、预算、口味一句话就行",
  },
  {
    step: "2",
    title: "读评价",
    detail: "从评价里提标签和避坑，不编理由",
  },
  {
    step: "3",
    title: "给决策",
    detail: "Top 3、原文引用，再记下你去了哪",
  },
] as const;

export function HomeHowItWorks() {
  return (
    <section className="mt-8 w-full min-w-0 max-w-full">
      <p className="text-xs font-medium text-neutral-500">参谋怎么找店</p>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 sm:gap-3">
        {STEPS.map((item) => (
          <article
            key={item.step}
            className="min-w-0 rounded-2xl bg-white/80 px-2.5 py-3 ring-1 ring-black/5 sm:rounded-3xl sm:px-4 sm:py-4"
          >
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink">
              {item.step}
            </span>
            <h2 className="mt-2 text-sm font-semibold tracking-tight">{item.title}</h2>
            <p className="mt-1 text-[11px] leading-4 break-words text-neutral-500 sm:text-xs sm:leading-5">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
