"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { CheckIcon, PencilIcon } from "@/components/icons";
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
    <li
      className="hover:bg-sunken/70 flex flex-col gap-3 rounded-2xl px-3 py-4 transition-colors"
      data-testid="habit" data-habit-id={habit.id}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold break-words" data-testid="habit-name">
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
          <PencilIcon />
          <span className="hidden sm:inline">Edit</span>
        </Link>
      </div>
      <ol className="grid grid-cols-7 gap-1 sm:flex sm:gap-1.5" aria-label={`“${habit.name}”, the last seven days`}>
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
          "flex w-full flex-col items-center rounded-2xl sm:w-11 border-2 py-1.5 text-xs transition-all duration-200 outline-none hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-ring/35 active:scale-95",
          day.done
            ? "bg-mint-soft border-mint text-mint-ink"
            : "bg-card text-muted-foreground border-border hover:border-mint hover:bg-mint-soft/60",
          day.isToday && "ring-peach ring-offset-card ring-2 ring-offset-2",
        )}
      >
        <span className="font-medium">{day.weekday}</span>
        <span className="text-foreground text-sm font-bold">{day.dayOfMonth}</span>
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-3.5 items-center justify-center rounded-full",
            day.done ? "bg-mint text-white dark:text-background" : "bg-sunken",
          )}
        >
          {day.done && <CheckIcon className="motion-safe:animate-pop size-2.5" />}
        </span>
      </button>
    </form>
  );
}
