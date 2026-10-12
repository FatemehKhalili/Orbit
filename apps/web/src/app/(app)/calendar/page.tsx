import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowBackIcon, ArrowForwardIcon, CalendarIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnavailableCard } from "@/components/unavailable-card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { agendaEnd, agendaStart, AGENDA_DAYS, buildAgenda, rangeLabel } from "@/lib/calendar";
import { listEvents } from "@/lib/calendar-api";
import { addDays } from "@/lib/days";
import { LOGIN_PATH } from "@/lib/routes";
import { getTime } from "@/lib/time-api";
import { cn } from "@/lib/utils";

import { AddEventForm } from "./add-event-form";
import { EventRow } from "./event-row";

export const metadata: Metadata = { title: "Calendar · Orbit" };

function agendaHref(first: string, today: string): string {
  return first === today ? "/calendar" : `/calendar?from=${first}`;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { from } = await searchParams;
  const user = await requireUser();
  const token = await getSessionToken();
  // "Today" comes from the API, in the instance timezone (ADR 0008), never from this server.
  const time = user && token ? await getTime(token) : null;
  const first = time?.ok ? agendaStart(from, time.data.today) : null;
  const events = token && first ? await listEvents(token, first, agendaEnd(first)) : null;
  if ([time, events].some((result) => result && !result.ok && result.error === "unauthenticated")) {
    redirect(LOGIN_PATH);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader
        title="Calendar"
        description={first ? rangeLabel(first) : "See and plan time."}
        descriptionTestId="calendar-range"
        icon={CalendarIcon}
        tone="lavender"
      />

      {time?.ok && first && events?.ok ? (
        <>
          <nav aria-label="Weeks" className="flex flex-wrap items-center gap-2">
            <Link
              href={agendaHref(addDays(first, -AGENDA_DAYS), time.data.today)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              data-testid="calendar-previous"
            >
              <ArrowBackIcon />
              Previous {AGENDA_DAYS} days
            </Link>
            {first !== time.data.today && (
              <Link
                href="/calendar"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                data-testid="calendar-today"
              >
                Today
              </Link>
            )}
            <Link
              href={agendaHref(addDays(first, AGENDA_DAYS), time.data.today)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              data-testid="calendar-next"
            >
              Next {AGENDA_DAYS} days
              <ArrowForwardIcon />
            </Link>
          </nav>

          <Card data-testid="agenda">
            <CardContent className="px-3 sm:px-4">
              <ol className="flex flex-col gap-4">
                {buildAgenda(first, time.data.today, events.data).map((day) => (
                  <li
                    key={day.day}
                    className="flex flex-col gap-1"
                    data-testid="agenda-day"
                    data-day={day.day}
                  >
                    <h2
                      className={cn(
                        "flex items-center gap-2 px-3 text-sm font-bold",
                        day.isToday ? "text-lavender-ink" : "text-muted-foreground",
                      )}
                    >
                      {day.label}
                      {day.isToday && <Badge variant="default">Today</Badge>}
                    </h2>
                    {day.events.length === 0 ? (
                      <p className="text-muted-foreground/80 px-3 py-2 text-sm">Nothing planned</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5" aria-label={day.label}>
                        {day.events.map(({ event, time: label }) => (
                          <EventRow key={event.id} event={event} time={label} />
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add an event</CardTitle>
            </CardHeader>
            <CardContent>
              <AddEventForm day={first} />
            </CardContent>
          </Card>
        </>
      ) : (
        <UnavailableCard
          data-testid="calendar-unavailable"
          title="Your calendar could not be loaded"
          description="Orbit could not reach its server. Try again in a moment."
        />
      )}
    </main>
  );
}
