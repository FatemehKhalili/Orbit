import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55 shrink-0 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-button hover:bg-primary-hover hover:-translate-y-px",
        soft: "bg-secondary text-secondary-foreground hover:bg-lavender-soft hover:shadow-soft",
        outline:
          "border border-border-strong bg-card text-foreground shadow-soft hover:border-lavender hover:bg-accent",
        ghost: "text-foreground hover:bg-secondary hover:text-secondary-foreground",
        destructive: "text-destructive hover:bg-destructive-soft",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-[0.8125rem]",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
