import { Radar } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  withText = true,
  size = "md",
}: {
  className?: string;
  withText?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const tile =
    size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const text =
    size === "sm" ? "text-lg" : size === "lg" ? "text-2xl" : "text-xl";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow-sm",
          tile,
        )}
      >
        <Radar className="h-[60%] w-[60%]" strokeWidth={2.4} />
      </span>
      {withText && (
        <span className={cn("font-heading tracking-wider", text)}>
          Wholesale<span className="text-primary text-glow-sm">OS</span>
        </span>
      )}
    </span>
  );
}
