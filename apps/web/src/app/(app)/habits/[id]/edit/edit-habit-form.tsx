"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE } from "@/lib/habits";
import type { Habit } from "@/lib/habits-api";

import { editHabit } from "../../actions";
import { HabitFields } from "../../habit-fields";

export function EditHabitForm({ habit }: { habit: Habit }) {
  const [state, action, pending] = useActionState(editHabit, IDLE);
  const values =
    state.status === "error" && state.fields
      ? state.fields
      : { name: habit.name, notes: habit.notes ?? "" };

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="edit-habit-form">
      <input type="hidden" name="id" value={habit.id} />
      <HabitFields idPrefix="edit-habit" values={values} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Link href="/habits" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
