import type { ReactNode } from "react";

import { CloudIllustration } from "@/components/illustrations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Something could not be loaded or found: a calm card with a sleepy cloud. */
export function UnavailableCard({
  title,
  description,
  children,
  ...props
}: {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Card className="max-w-lg" {...props}>
      <CardHeader className="grid-cols-[auto_1fr] gap-x-4">
        <span className="bg-lavender-soft text-lavender-ink row-span-2 flex size-14 items-center justify-center rounded-2xl text-4xl">
          <CloudIllustration />
        </span>
        <CardTitle className="self-end">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}
