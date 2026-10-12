"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { boughtFields, todayCheckInFields, type TodayHabit } from "@/lib/dashboard";
import { IDLE } from "@/lib/forms";
import type { Day } from "@/lib/habits-api";
import type { ShoppingItem } from "@/lib/shopping-api";
import { cn } from "@/lib/utils";

import { checkIn } from "./habits/actions";
import { toggleItem } from "./shopping/actions";

// The whole row is the button, so it is an easy target on a phone. Each row is its own
// form with its own state: the button is disabled while its change is on the way (no
// double submits), and a failure shows under that row and leaves the button ready again.

const ROW_BUTTON =
  "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-colors outline-none hover:bg-sunken/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-wait";

function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function CheckCircle({ checked, tone }: { checked: boolean; tone: "mint" | "peach" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 group-active:scale-90",
        checked
          ? "bg-mint border-mint text-mint-foreground"
          : tone === "mint"
            ? "border-border-strong bg-card group-hover:border-mint group-hover:bg-mint-soft"
            : "border-border-strong bg-card group-hover:border-peach group-hover:bg-peach-soft",
      )}
    >
      {checked && <CheckIcon className="motion-safe:animate-pop size-3.5" />}
    </span>
  );
}

function Saving({ pending }: { pending: boolean }) {
  return pending ? (
    <span aria-hidden className="text-muted-foreground ms-auto shrink-0 text-xs">
      Saving…
    </span>
  ) : null;
}

/** Announces the change to screen readers; the button's own text is its label. */
function Announce({ pending }: { pending: boolean }) {
  return (
    <span role="status" className="sr-only">
      {pending ? "Saving…" : ""}
    </span>
  );
}

/** One active habit and its check button for today. */
export function TodayHabitRow({ row, today }: { row: TodayHabit; today: Day }) {
  const [state, action, pending] = useActionState(checkIn, IDLE);
  // While the change is on its way, show where it is going.
  const done = pending ? !row.done : row.done;
  const { habit } = row;

  return (
    <li data-testid="dashboard-habit" data-habit-id={habit.id} data-done={done}>
      <form action={action} data-testid={`dashboard-check-in-${habit.id}`}>
        <HiddenFields fields={todayCheckInFields(row, today)} />
        <button
          type="submit"
          disabled={pending}
          aria-pressed={row.done}
          aria-label={`“${habit.name}”, today: ${row.done ? "mark not done" : "mark done"}`}
          className={ROW_BUTTON}
        >
          <CheckCircle checked={done} tone="mint" />
          <span
            className={cn(
              "min-w-0 flex-1 font-medium break-words transition-colors",
              done && "text-mint-ink",
            )}
          >
            {habit.name}
          </span>
          <Saving pending={pending} />
        </button>
      </form>
      <Announce pending={pending} />
      {state.status === "error" && (
        <div className="px-3 pb-1">
          <FormMessage state={state} />
        </div>
      )}
    </li>
  );
}

/** One unchecked shopping item and its "bought" button. */
export function ToBuyRow({ item }: { item: ShoppingItem }) {
  const [state, action, pending] = useActionState(toggleItem, IDLE);

  return (
    <li data-testid="dashboard-item" data-item-id={item.id} data-checked={pending}>
      <form action={action} data-testid={`dashboard-toggle-item-${item.id}`}>
        <HiddenFields fields={boughtFields(item)} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Mark “${item.name}” as bought`}
          className={ROW_BUTTON}
        >
          <CheckCircle checked={pending} tone="peach" />
          <span
            className={cn(
              "min-w-0 flex-1 font-medium break-words transition-colors",
              pending && "text-muted-foreground decoration-blush line-through decoration-2",
            )}
          >
            {item.name}
          </span>
          {item.quantity && !pending && <Badge variant="secondary">{item.quantity}</Badge>}
          <Saving pending={pending} />
        </button>
      </form>
      <Announce pending={pending} />
      {state.status === "error" && (
        <div className="px-3 pb-1">
          <FormMessage state={state} />
        </div>
      )}
    </li>
  );
}
