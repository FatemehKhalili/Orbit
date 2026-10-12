import * as React from "react";

import { cn } from "@/lib/utils";

import { fieldClasses } from "./field";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, "flex min-h-20 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export { Textarea };
