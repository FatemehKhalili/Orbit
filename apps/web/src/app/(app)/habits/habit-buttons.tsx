"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/habits";
import type { Habit } from "@/lib/habits-api";

import { archiveHabit, deleteHabitForGood } from "./actions";

/** Archive an active habit, or restore an archived one. */
export function ArchiveButton({ habit }: { habit: Pick<Habit, "id" | "name" | "archived"> }) {
  const [state, action, pending] = useActionState(archiveHabit, IDLE);
  const [verb, working] = habit.archived
    ? ["Restore", "Restoring…"]
    : ["Archive", "Archiving…"];

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-3"
      data-testid={`${habit.archived ? "restore" : "archive"}-habit-${habit.id}`}
    >
      <input type="hidden" name="id" value={habit.id} />
      <input type="hidden" name="archived" value={String(!habit.archived)} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`${verb} “${habit.name}”`}
      >
        {pending ? working : verb}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

/** Delete an archived habit and its history for good. The API refuses active habits. */
export function DeleteButton({ habit }: { habit: Pick<Habit, "id" | "name"> }) {
  const [state, action, pending] = useActionState(deleteHabitForGood, IDLE);

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-3"
      data-testid={`delete-habit-${habit.id}`}
    >
      <input type="hidden" name="id" value={habit.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Delete “${habit.name}” and its history for good`}
        className="text-destructive"
      >
        {pending ? "Deleting…" : "Delete for good"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
