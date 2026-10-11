import * as React from "react";

import { cn } from "@/lib/utils";

import { fieldClasses } from "./field";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClasses, "h-11", className)}
      {...props}
    />
  );
}

export { Input };
