"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/calendar";
import type { Day } from "@/lib/time-api";

import { addEvent } from "./actions";
import { EventFields } from "./event-fields";

/** Adds an event; the day starts as the agenda's first day. */
export function AddEventForm({ day }: { day: Day }) {
  const [state, action, pending] = useActionState(addEvent, IDLE);
  // After an error the fields keep what was typed; after success they start again.
  const values = state.status === "error" && state.fields ? state.fields : { startDay: day };

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="add-event-form">
      <EventFields idPrefix="new-event" values={values} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <PlusIcon />
          {pending ? "Adding…" : "Add event"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
