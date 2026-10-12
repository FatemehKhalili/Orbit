import type { ComponentType, ReactNode, SVGProps } from "react";

import { TONES, type Tone } from "@/components/modules";
import { cn } from "@/lib/utils";

/** A page title with its module icon in a soft bubble, and an optional line under it. */
export function PageHeader({
  title,
  description,
  icon: Icon,
  tone = "lavender",
  descriptionTestId,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: Tone;
  descriptionTestId?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-4">
      {Icon && (
        <span
          className={cn(
            "flex size-13 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-soft",
            TONES[tone].soft,
            TONES[tone].ink,
          )}
        >
          <Icon />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground" data-testid={descriptionTestId}>
            {description}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}
