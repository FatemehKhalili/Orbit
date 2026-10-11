import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionToken, requireUser } from "@/lib/auth";
import { getHabit } from "@/lib/habits-api";
import { LOGIN_PATH } from "@/lib/routes";

import { ArchiveButton, DeleteButton } from "../../habit-buttons";
import { EditHabitForm } from "./edit-habit-form";

export const metadata: Metadata = { title: "Edit habit · Habits · Orbit" };

export default async function EditHabitPage({ params }: PageProps<"/habits/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const token = await getSessionToken();
  // The API returns only the signed-in owner's own habit; anything else is "not found".
  const result = user && token ? await getHabit(token, id) : null;
  if (result && !result.ok && result.error === "unauthenticated") redirect(LOGIN_PATH);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Habits</h1>
      {result?.ok ? (
        result.data.archived ? (
          // Archived habits are read-only (ADR 0007 addendum): restore or delete only.
          <Card data-testid="archived-habit">
            <CardHeader>
              <CardTitle className="break-words">{result.data.name}</CardTitle>
              <CardDescription>
                This habit is archived, so it and its history cannot be changed. Restore it to
                edit it again, or delete it and its history for good.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <ArchiveButton habit={result.data} />
              <DeleteButton habit={result.data} />
              <Link
                href="/habits/archived"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Archived habits
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Edit habit</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <EditHabitForm habit={result.data} />
              <div className="flex flex-col gap-2 border-t pt-4">
                <p className="text-muted-foreground text-sm">
                  Archive a habit you no longer track. It keeps its history and can be restored.
                  Only archived habits can be deleted.
                </p>
                <ArchiveButton habit={result.data} />
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <Card className="max-w-lg" data-testid="habit-missing">
          <CardHeader>
            <CardTitle>
              {result?.ok === false && result.error !== "unavailable"
                ? "This habit does not exist"
                : "This habit could not be loaded"}
            </CardTitle>
            <CardDescription>
              {result?.ok === false && result.error !== "unavailable"
                ? "It may have been deleted."
                : "Orbit could not reach its server. Try again in a moment."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/habits" className={buttonVariants({ variant: "outline" })}>
              Back to habits
            </Link>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
