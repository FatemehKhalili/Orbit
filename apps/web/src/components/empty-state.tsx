import type { ReactNode } from "react";

import { TONES, type Tone } from "@/components/modules";
import { cn } from "@/lib/utils";

/**
 * A friendly "nothing here" message: a small illustration in the module's tone, a title
 * and a hint about what to do next.
 */
export function EmptyState({
  illustration,
  title,
  children,
  tone = "lavender",
  className,
  ...props
}: {
  illustration: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  tone?: Tone;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-sunken/50 px-6 py-8 text-center",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "motion-safe:animate-float flex size-16 items-center justify-center rounded-full text-3xl",
          TONES[tone].soft,
          TONES[tone].ink,
        )}
      >
        {illustration}
      </span>
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <p className="text-muted-foreground max-w-xs text-sm">{children}</p>}
    </div>
  );
}
