import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarIcon, TrashIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { getEvent } from "@/lib/calendar-api";
import { LOGIN_PATH } from "@/lib/routes";

import { EventMissing } from "../event-missing";
import { EditEventForm } from "./edit-event-form";

export const metadata: Metadata = { title: "Edit event · Calendar · Orbit" };

export default async function EditEventPage({ params }: PageProps<"/calendar/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const token = await getSessionToken();
  // The API returns only the signed-in owner's own event; anything else is "not found".
  const result = user && token ? await getEvent(token, id) : null;
  if (result && !result.ok && result.error === "unauthenticated") redirect(LOGIN_PATH);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader title="Calendar" icon={CalendarIcon} tone="lavender" />
      {result?.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit event</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <EditEventForm event={result.data} />
            <div className="bg-sunken/60 flex flex-col items-start gap-3 rounded-2xl p-4">
              <p className="text-muted-foreground text-sm">
                Deleting an event removes it for good. You will be asked to confirm.
              </p>
              <Link
                href={`/calendar/${result.data.id}/delete`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                aria-label={`Delete “${result.data.title}”…`}
                data-testid="delete-event-link"
              >
                <TrashIcon />
                Delete…
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EventMissing error={result?.ok === false ? result.error : null} />
      )}
    </main>
  );
}
