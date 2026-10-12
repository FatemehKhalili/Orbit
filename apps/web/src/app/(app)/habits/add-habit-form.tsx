"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/habits";

import { addHabit } from "./actions";
import { HabitFields } from "./habit-fields";

export function AddHabitForm() {
  const [state, action, pending] = useActionState(addHabit, IDLE);
  // After an error the fields keep what was typed; after success they start empty.
  const values = state.status === "error" ? state.fields : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="add-habit-form">
      <HabitFields idPrefix="new-habit" values={values} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <PlusIcon />
          {pending ? "Adding…" : "Add habit"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
