import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CalendarIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { timeLabel } from "@/lib/calendar";
import { getEvent } from "@/lib/calendar-api";
import { formatLongDate } from "@/lib/days";
import { LOGIN_PATH } from "@/lib/routes";

import { EventMissing } from "../event-missing";
import { DeleteEventForm } from "./delete-event-form";

export const metadata: Metadata = { title: "Delete event · Calendar · Orbit" };

/** Deleting an event takes two steps: the Edit page links here, and this page confirms. */
export default async function DeleteEventPage({ params }: PageProps<"/calendar/[id]/delete">) {
  const { id } = await params;
  const user = await requireUser();
  const token = await getSessionToken();
  const result = user && token ? await getEvent(token, id) : null;
  if (result && !result.ok && result.error === "unauthenticated") redirect(LOGIN_PATH);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader title="Calendar" icon={CalendarIcon} tone="lavender" />
      {result?.ok ? (
        <Card className="max-w-lg" data-testid="confirm-delete-event">
          <CardHeader>
            <CardTitle>Delete this event?</CardTitle>
            <CardDescription>
              “<span className="text-foreground font-semibold break-words">{result.data.title}</span>”
              on {formatLongDate(result.data.firstDay)}
              {result.data.allDay ? "" : `, ${timeLabel(result.data, result.data.firstDay)}`} will
              be removed for good. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteEventForm event={result.data} />
          </CardContent>
        </Card>
      ) : (
        <EventMissing error={result?.ok === false ? result.error : null} />
      )}
    </main>
  );
}
