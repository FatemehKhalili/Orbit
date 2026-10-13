"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { eventFields, IDLE } from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/calendar-api";

import { editEvent } from "../../actions";
import { EventFields } from "../../event-fields";

export function EditEventForm({ event }: { event: CalendarEvent }) {
  const [state, action, pending] = useActionState(editEvent, IDLE);
  const values = state.status === "error" && state.fields ? state.fields : eventFields(event);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="edit-event-form">
      <input type="hidden" name="id" value={event.id} />
      <EventFields idPrefix="edit-event" values={values} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Link href="/calendar" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
