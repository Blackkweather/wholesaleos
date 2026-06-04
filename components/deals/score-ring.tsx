import { cn } from "@/lib/utils";

export function scoreTone(score: number): "brand" | "warning" | "danger" {
  return score >= 78 ? "brand" : score >= 60 ? "warning" : "danger";
}

const TONE_CLASS: Record<string, string> = {
  brand: "text-brand",
  warning: "text-warning",
  danger: "text-danger",
};

export function ScoreRing({
  score,
  size = 56,
  stroke = 5,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  const tone = TONE_CLASS[scoreTone(clamped)];

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          className="fill-none stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("fill-none transition-all duration-700 ease-out", tone)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className={cn("font-mono text-sm font-bold", tone)}>
          {clamped}
        </span>
      </div>
    </div>
  );
}
