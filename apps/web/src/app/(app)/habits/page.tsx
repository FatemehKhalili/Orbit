import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Habits</h1>
        <p className="text-muted-foreground mt-1" data-testid="habits-today">
          {time?.ok ? formatLongDate(time.data.today) : "Build and track routines."}
        </p>
      </header>

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
            <CardHeader>
              <CardTitle>Your habits</CardTitle>
              <CardDescription>
                {summarize(habits.data, time.data.today)}. Check off today or any of the six days
                before.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {habits.data.length === 0 ? (
                <p className="text-muted-foreground text-sm" data-testid="habits-empty">
                  No habits yet. Add the first one above.
                </p>
              ) : (
                <ul className="divide-y">
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
            Archived habits{archived?.ok ? ` (${archived.data.length})` : ""}
          </Link>
        </>
      ) : (
        <Card className="max-w-lg" data-testid="habits-unavailable">
          <CardHeader>
            <CardTitle>Your habits could not be loaded</CardTitle>
            <CardDescription>
              Orbit could not reach its server. Try again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
