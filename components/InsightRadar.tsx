const RADAR_AXES = [
  { key: "taste_quality", label: "出品" },
  { key: "environment", label: "环境" },
  { key: "service", label: "服务" },
  { key: "value", label: "性价比" },
  { key: "scene_fit", label: "场景" },
] as const;

export type RadarAxisKey = (typeof RADAR_AXES)[number]["key"];

export type RadarScores = Partial<Record<RadarAxisKey, number | null | undefined>>;

interface InsightRadarProps {
  scores: RadarScores | null | undefined;
  compact?: boolean;
}

const MAX_SCORE = 10;
const RING_STEPS = [2, 4, 6, 8, 10] as const;

function polar(
  cx: number,
  cy: number,
  radius: number,
  index: number,
  total: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function clampScore(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_SCORE, Math.max(0, value));
}

function ringPoints(cx: number, cy: number, radius: number, total: number): string {
  return Array.from({ length: total }, (_, index) => {
    const point = polar(cx, cy, radius, index, total);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

function labelAnchor(index: number, total: number): {
  anchor: "start" | "middle" | "end";
  dy: number;
} {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg > 250 && deg < 290) {
    return { anchor: "middle", dy: -4 };
  }
  if (deg > 70 && deg < 110) {
    return { anchor: "middle", dy: 12 };
  }
  if (deg >= 110 && deg <= 250) {
    return { anchor: "end", dy: 4 };
  }
  return { anchor: "start", dy: 4 };
}

/** 五维评价雷达：品牌黄填充，与卡片圆角 / 中性灰网格对齐 */
export function InsightRadar({ scores, compact = false }: InsightRadarProps) {
  const width = compact ? 232 : 280;
  const height = compact ? 210 : 248;
  const cx = width / 2;
  const cy = height / 2 + 4;
  const radius = compact ? 62 : 78;
  const labelRadius = radius + (compact ? 20 : 24);
  const total = RADAR_AXES.length;

  const dataPoints = RADAR_AXES.map((axis, index) => {
    const score = clampScore(scores?.[axis.key]);
    return polar(cx, cy, (score / MAX_SCORE) * radius, index, total);
  });
  const hasAnyScore = RADAR_AXES.some((axis) => {
    const value = scores?.[axis.key];
    return value !== null && value !== undefined && Number.isFinite(value);
  });

  const summary = RADAR_AXES.map((axis) => {
    const value = scores?.[axis.key];
    const shown =
      value !== null && value !== undefined && Number.isFinite(value) ? String(value) : "无";
    return `${axis.label}${shown}`;
  }).join("，");

  return (
    <div className="flex w-full min-w-0 flex-col items-center rounded-2xl bg-neutral-50 px-2 py-3 sm:px-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={compact ? "h-[188px] w-full max-w-[232px]" : "h-[220px] w-full max-w-[280px] sm:h-[236px]"}
        role="img"
        aria-label={`评价五维：${summary}`}
      >
        {RING_STEPS.map((step) => (
          <polygon
            key={step}
            points={ringPoints(cx, cy, (step / MAX_SCORE) * radius, total)}
            fill="none"
            stroke="#1a1a1a"
            strokeOpacity={step === MAX_SCORE ? 0.12 : 0.06}
            strokeWidth={step === MAX_SCORE ? 1.2 : 1}
          />
        ))}
        {RADAR_AXES.map((axis, index) => {
          const end = polar(cx, cy, radius, index, total);
          return (
            <line
              key={`${axis.key}-axis`}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="#1a1a1a"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}
        {hasAnyScore ? (
          <polygon
            points={dataPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
            fill="#ffd100"
            fillOpacity={0.42}
            stroke="#1a1a1a"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        ) : null}
        {hasAnyScore
          ? dataPoints.map((point, index) => (
              <circle
                key={`${RADAR_AXES[index]!.key}-dot`}
                cx={point.x}
                cy={point.y}
                r={3}
                fill="#ffd100"
                stroke="#1a1a1a"
                strokeWidth={1}
              />
            ))
          : null}
        {RADAR_AXES.map((axis, index) => {
          const point = polar(cx, cy, labelRadius, index, total);
          const { anchor, dy } = labelAnchor(index, total);
          const raw = scores?.[axis.key];
          const scoreText =
            raw !== null && raw !== undefined && Number.isFinite(raw) ? String(raw) : "—";
          return (
            <text
              key={`${axis.key}-label`}
              x={point.x}
              y={point.y + dy}
              textAnchor={anchor}
              fill="#737373"
              fontFamily="inherit"
              style={{ fontSize: compact ? 10 : 11 }}
            >
              {axis.label}
              <tspan fill="#1a1a1a" fontWeight={600}>
                {" "}
                {scoreText}
              </tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export { RADAR_AXES };
