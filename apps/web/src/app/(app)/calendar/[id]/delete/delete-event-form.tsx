"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { TrashIcon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE } from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/calendar-api";

import { deleteEventForGood } from "../../actions";

/** The second, deliberate step of a delete: confirm, or keep the event. */
export function DeleteEventForm({ event }: { event: Pick<CalendarEvent, "id" | "title"> }) {
  const [state, action, pending] = useActionState(deleteEventForGood, IDLE);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3" data-testid="delete-event-form">
      <input type="hidden" name="id" value={event.id} />
      <input type="hidden" name="confirm" value="delete" />
      <Button
        type="submit"
        variant="destructive"
        disabled={pending}
        aria-label={`Delete “${event.title}” for good`}
      >
        <TrashIcon />
        {pending ? "Deleting…" : "Delete event"}
      </Button>
      <Link
        href={`/calendar/${event.id}/edit`}
        className={buttonVariants({ variant: "outline" })}
        data-testid="keep-event"
      >
        Keep it
      </Link>
      <FormMessage state={state} />
    </form>
  );
}
