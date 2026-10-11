"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { buttonVariants } from "@/components/ui/button";
import { buildWeek, IDLE, type WeekDay } from "@/lib/habits";
import type { Day, Habit } from "@/lib/habits-api";
import { cn } from "@/lib/utils";

import { checkIn } from "./actions";

/** One active habit: its seven-day strip and an Edit link. Each day is a small form. */
export function HabitRow({ habit, today }: { habit: Habit; today: Day }) {
  // One state for the whole strip, so a failure shows under the habit, not under a day.
  const [state, action, pending] = useActionState(checkIn, IDLE);

  return (
    <li className="flex flex-col gap-3 py-4" data-testid="habit" data-habit-id={habit.id}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium break-words" data-testid="habit-name">
            {habit.name}
          </span>
          {habit.notes && (
            <p className="text-muted-foreground text-sm break-words whitespace-pre-line">
              {habit.notes}
            </p>
          )}
        </div>
        <Link
          href={`/habits/${habit.id}/edit`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Edit “${habit.name}”`}
        >
          Edit
        </Link>
      </div>
      <ol className="flex flex-wrap gap-1" aria-label={`“${habit.name}”, the last seven days`}>
        {buildWeek(today, habit.checkIns).map((day) => (
          <li key={day.day}>
            <DayToggle habit={habit} day={day} action={action} pending={pending} />
          </li>
        ))}
      </ol>
      {state.status === "error" && <FormMessage state={state} />}
    </li>
  );
}

function DayToggle({
  habit,
  day,
  action,
  pending,
}: {
  habit: Habit;
  day: WeekDay;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={action} data-testid={`check-in-${habit.id}-${day.day}`}>
      <input type="hidden" name="id" value={habit.id} />
      <input type="hidden" name="day" value={day.day} />
      {/* The state to switch to, so a repeated submit cannot flip it back. */}
      <input type="hidden" name="done" value={String(!day.done)} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={day.done}
        aria-label={`“${habit.name}”, ${day.label}${day.isToday ? " (today)" : ""}: ${
          day.done ? "mark not done" : "mark done"
        }`}
        className={cn(
          "flex w-10 flex-col items-center rounded-md border py-1 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          day.done ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary",
          day.isToday && !day.done && "border-primary",
        )}
      >
        <span>{day.weekday}</span>
        <span className="text-sm font-medium">{day.dayOfMonth}</span>
      </button>
    </form>
  );
}
