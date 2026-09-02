"use client";

import { ResultsSkeleton } from "@/components/Skeleton";
import { useEffect, useState } from "react";

const STEPS = [
  "正在匹配候选商家…",
  "正在分析评价…",
  "正在提取口味维度…",
  "正在生成推荐理由…",
];

interface AnalyzeProgressProps {
  hint?: string;
}

export function AnalyzeProgress({ hint }: AnalyzeProgressProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STEPS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  return <ResultsSkeleton hint={hint ?? STEPS[index]} />;
}
