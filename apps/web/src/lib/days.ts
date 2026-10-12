/**
 * Calendar dates from the API ("2026-10-11"), counted and labelled without a timezone.
 * They are parsed and formatted in UTC, so the web server's own timezone can never move a
 * day to its neighbour (ADR 0008).
 */

import type { Day } from "@/lib/time-api";

function toUtcDate(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: Day, days: number): Day {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

export function formatDay(day: Day, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(toUtcDate(day));
}

/** "Sunday, 11 October 2026". */
export function formatLongDate(day: Day): string {
  return formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
