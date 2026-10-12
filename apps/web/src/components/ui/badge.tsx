import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Pill badges. Each tone keeps one meaning across Orbit (see globals.css). */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-lavender-soft text-lavender-ink",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-mint-soft text-mint-ink",
        warning: "border-transparent bg-peach-soft text-peach-ink",
        destructive: "border-transparent bg-blush-soft text-blush-ink",
        outline: "border-border-strong bg-card text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** A small dot that leads a status badge. */
function BadgeDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-1.5 rounded-full bg-current", className)} />;
}

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, BadgeDot, badgeVariants };
