import Link from "next/link";

import { PencilIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import type { CalendarEvent } from "@/lib/calendar-api";
import { cn } from "@/lib/utils";

/** One event on one day of the agenda: when, what, and an Edit link. */
export function EventRow({ event, time }: { event: CalendarEvent; time: string }) {
  return (
    <li
      className="hover:bg-sunken/70 flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors"
      data-testid="event"
      data-event-id={event.id}
    >
      <span
        className={cn(
          "mt-0.5 w-24 shrink-0 text-sm font-semibold tabular-nums",
          event.allDay ? "text-lavender-ink" : "text-muted-foreground",
        )}
        data-testid="event-time"
      >
        {time}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold break-words" data-testid="event-title">
          {event.title}
        </span>
        {event.notes && (
          <p className="text-muted-foreground text-sm break-words whitespace-pre-line">
            {event.notes}
          </p>
        )}
      </div>
      <Link
        href={`/calendar/${event.id}/edit`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label={`Edit “${event.title}”`}
      >
        <PencilIcon />
        <span className="hidden sm:inline">Edit</span>
      </Link>
    </li>
  );
}
