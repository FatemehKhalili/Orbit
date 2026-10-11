import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { ArchiveIcon, SproutIcon } from "@/components/icons";
import { SeedlingIllustration } from "@/components/illustrations";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnavailableCard } from "@/components/unavailable-card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { formatLongDate, summarize } from "@/lib/habits";
import { getTime, listHabits } from "@/lib/habits-api";
import { LOGIN_PATH } from "@/lib/routes";

import { AddHabitForm } from "./add-habit-form";
import { HabitRow } from "./habit-row";

export const metadata: Metadata = { title: "Habits · Orbit" };

export default async function HabitsPage() {
  const user = await requireUser();
  const token = await getSessionToken();
  // "Today" comes from the API, in the instance timezone (ADR 0008), never from this server.
  const results =
    user && token
      ? await Promise.all([
          getTime(token),
          listHabits(token),
          listHabits(token, { archived: true }),
        ])
      : null;
  if (results?.some((result) => !result.ok && result.error === "unauthenticated")) {
    redirect(LOGIN_PATH);
  }
  const [time, habits, archived] = results ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader
        title="Habits"
        description={time?.ok ? formatLongDate(time.data.today) : "Build and track routines."}
        descriptionTestId="habits-today"
        icon={SproutIcon}
        tone="mint"
      />

      {time?.ok && habits?.ok ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Add a habit</CardTitle>
            </CardHeader>
            <CardContent>
              <AddHabitForm />
            </CardContent>
          </Card>

          <Card data-testid="habit-list">
            <CardHeader className="grid-cols-[1fr_auto] items-center">
              <CardTitle>Your habits</CardTitle>
              <Badge variant="success">{summarize(habits.data, time.data.today)}</Badge>
              <CardDescription className="col-span-2">
                Check off today or any of the six days before.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-4">
              {habits.data.length === 0 ? (
                <EmptyState
                  tone="mint"
                  illustration={<SeedlingIllustration />}
                  title="Nothing planted yet"
                  className="mx-3 sm:mx-2"
                  data-testid="habits-empty"
                >
                  No habits yet. Add the first one above and watch your week grow.
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-1">
                  {habits.data.map((habit) => (
                    <HabitRow key={habit.id} habit={habit} today={time.data.today} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Link
            href="/habits/archived"
            className={buttonVariants({ variant: "outline", className: "self-start" })}
            data-testid="archived-habits-link"
          >
            <ArchiveIcon />
            Archived habits{archived?.ok ? ` (${archived.data.length})` : ""}
          </Link>
        </>
      ) : (
        <UnavailableCard
          data-testid="habits-unavailable"
          title="Your habits could not be loaded"
          description="Orbit could not reach its server. Try again in a moment."
        />
      )}
    </main>
  );
}
