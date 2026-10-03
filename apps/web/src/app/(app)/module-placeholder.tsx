import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

/** A module page that has no content yet. */
export async function ModulePlaceholder({ name, purpose }: { name: string; purpose: string }) {
  await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      <Card className="max-w-lg" data-testid="module-placeholder">
        <CardHeader>
          <CardTitle>Coming in a later phase</CardTitle>
          <CardDescription>{purpose}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
