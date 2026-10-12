import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { ArchiveIcon, ArrowBackIcon } from "@/components/icons";
import { BoxIllustration } from "@/components/illustrations";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UnavailableCard } from "@/components/unavailable-card";
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 lg:py-10">
      <PageHeader
        title="Archived habits"
        description="Archived habits keep their history and cannot be changed. Restore one to use it again, or delete it and its history for good."
        icon={ArchiveIcon}
        tone="lavender"
      />

      {habits?.ok ? (
        <Card data-testid="archived-habit-list">
          <CardContent className="px-3 sm:px-4">
            {habits.data.length === 0 ? (
              <EmptyState
                illustration={<BoxIllustration />}
                title="No archived habits"
                className="mx-3 sm:mx-2"
                data-testid="archived-habits-empty"
              >
                Habits you archive rest here, history and all.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-1">
                {habits.data.map((habit) => (
                  <li
                    key={habit.id}
                    className="hover:bg-sunken/70 flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3 transition-colors"
                    data-testid="archived-habit"
                  >
                    <span className="min-w-0 flex-1 font-semibold break-words" data-testid="habit-name">
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
        <UnavailableCard
          data-testid="habits-unavailable"
          title="Your archived habits could not be loaded"
          description="Orbit could not reach its server. Try again in a moment."
        />
      )}

      <Link
        href="/habits"
        className={buttonVariants({ variant: "outline", className: "self-start" })}
      >
        <ArrowBackIcon />
        Back to habits
      </Link>
    </main>
  );
}
