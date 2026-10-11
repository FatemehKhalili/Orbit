import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { listHabits } from "@/lib/habits-api";
import { LOGIN_PATH } from "@/lib/routes";

import { ArchiveButton, DeleteButton } from "../habit-buttons";

export const metadata: Metadata = { title: "Archived habits · Habits · Orbit" };

export default async function ArchivedHabitsPage() {
  const user = await requireUser();
  const token = await getSessionToken();
  const habits = user && token ? await listHabits(token, { archived: true }) : null;
  if (habits && !habits.ok && habits.error === "unauthenticated") redirect(LOGIN_PATH);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Archived habits</h1>
        <p className="text-muted-foreground mt-1">
          Archived habits keep their history and cannot be changed. Restore one to use it again,
          or delete it and its history for good.
        </p>
      </header>

      {habits?.ok ? (
        <Card data-testid="archived-habit-list">
          <CardContent>
            {habits.data.length === 0 ? (
              <p className="text-muted-foreground text-sm" data-testid="archived-habits-empty">
                No archived habits.
              </p>
            ) : (
              <ul className="divide-y">
                {habits.data.map((habit) => (
                  <li
                    key={habit.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                    data-testid="archived-habit"
                  >
                    <span className="min-w-0 flex-1 break-words" data-testid="habit-name">
                      {habit.name}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <ArchiveButton habit={habit} />
                      <DeleteButton habit={habit} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-lg" data-testid="habits-unavailable">
          <CardHeader>
            <CardTitle>Your archived habits could not be loaded</CardTitle>
            <CardDescription>
              Orbit could not reach its server. Try again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Link
        href="/habits"
        className={buttonVariants({ variant: "outline", className: "self-start" })}
      >
        Back to habits
      </Link>
    </main>
  );
}
