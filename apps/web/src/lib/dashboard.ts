/**
 * What the Dashboard's "Today's habits" and "To buy" cards show, and the fields their
 * forms send, without Next.js. The forms reuse the Habits and Shopping Server Actions, so
 * the API stays the authority on ownership, archived habits and the check-in window.
 */

import { countDoneToday } from "@/lib/habits";
import type { Habit } from "@/lib/habits-api";
import { countToBuy } from "@/lib/shopping";
import type { ShoppingItem } from "@/lib/shopping-api";
import type { Day } from "@/lib/time-api";

/** How many unchecked items the "To buy" card lists before linking to the Shopping page. */
export const TO_BUY_LIMIT = 5;

export type TodayHabit = { habit: Habit; done: boolean };

export type TodayHabits = {
  rows: TodayHabit[];
  /** The same numbers as the "Habits today" summary card. */
  done: number;
  total: number;
};

/** Every active habit, in the API's order, with whether it was done today. */
export function todayHabits(habits: Habit[], today: Day): TodayHabits {
  const active = habits.filter((habit) => !habit.archived);
  return {
    rows: active.map((habit) => ({ habit, done: habit.checkIns.includes(today) })),
    done: countDoneToday(active, today),
    total: active.length,
  };
}

export type ToBuyPreview = {
  /** The first unchecked items, in the order the Shopping page lists them. */
  shown: ShoppingItem[];
  /** Unchecked items not shown. */
  remaining: number;
  /** The same number as the "Shopping list" summary card. */
  toBuy: number;
};

export function toBuyPreview(items: ShoppingItem[], limit = TO_BUY_LIMIT): ToBuyPreview {
  const unchecked = items.filter((item) => !item.checked);
  const shown = unchecked.slice(0, Math.max(0, limit));
  return { shown, remaining: unchecked.length - shown.length, toBuy: countToBuy(items) };
}

/**
 * The hidden fields of a today check-in form. They carry the state to switch to, so a
 * repeated or doubled submit cannot flip it back.
 */
export function todayCheckInFields(row: TodayHabit, today: Day): Record<string, string> {
  return { id: row.habit.id, day: today, done: String(!row.done) };
}

/** The hidden fields of a "To buy" form: always "bought", never a toggle. */
export function boughtFields(item: Pick<ShoppingItem, "id">): Record<string, string> {
  return { id: item.id, checked: "true" };
}

/** "and 3 more to buy", for the link under the list. */
export function moreToBuyLabel(remaining: number): string {
  return `and ${remaining} more to buy`;
}
