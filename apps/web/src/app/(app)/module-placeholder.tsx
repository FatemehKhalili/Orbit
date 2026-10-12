import { PlanetIllustration } from "@/components/illustrations";
import { MODULE_LOOK, TONES } from "@/components/modules";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { MODULES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** A module page that has no content yet. */
export async function ModulePlaceholder({ name, purpose }: { name: string; purpose: string }) {
  await requireUser();
  const entry = MODULES.find((candidate) => candidate.name === name);
  const look = entry ? MODULE_LOOK[entry.href] : null;
  const tone = look?.tone ?? "lavender";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader title={name} description={purpose} icon={look?.icon} tone={tone} />
      <Card className="max-w-lg items-center text-center" data-testid="module-placeholder">
        <div
          className={cn(
            "motion-safe:animate-float flex size-24 items-center justify-center rounded-full text-6xl",
            TONES[tone].soft,
            TONES[tone].ink,
          )}
        >
          <PlanetIllustration />
        </div>
        <CardHeader className="justify-items-center">
          <Badge variant="warning">On its way</Badge>
          <CardTitle>Coming in a later phase</CardTitle>
          <CardDescription className="max-w-sm">
            {name} is still drifting toward Orbit. It will appear here when it lands.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
