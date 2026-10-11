/**
 * The Habits forms' logic, without Next.js: reads and checks the form, calls the API and
 * decides what the form shows next, plus the seven-day strip each habit shows. The Server
 * Actions in app/(app)/habits wire it to cookies, revalidation and redirects. The API is
 * the authority on validation, ownership, archived habits and the check-in window.
 */

import type { ApiError, ApiResult } from "@/lib/api-client";
import {
  type ApiErrorMessages,
  failedState,
  formText,
  type FormState,
  IDLE,
  SIGNED_OUT,
  textLength,
} from "@/lib/forms";
import type { Day, Habit, HabitChanges, NewHabit } from "@/lib/habits-api";

/** Must match the API (apps/api/app/models/habits.py and app/api/habits.py). */
export const HABIT_LIMITS = { name: 100, notes: 1000 } as const;
export const WINDOW_DAYS = 7;

export type HabitFields = { name: string; notes: string };

export type HabitFormState = FormState<HabitFields>;

export { IDLE };

export const HABIT_ERRORS = {
  nameMissing: "Enter a name for the habit.",
  nameTooLong: `Keep the name to ${HABIT_LIMITS.name} characters or fewer.`,
  notesTooLong: `Keep the notes to ${HABIT_LIMITS.notes} characters or fewer.`,
  missingHabit: "Orbit could not tell which habit to change. Reload the page and try again.",
  missingDay: "Orbit could not tell which day to change. Reload the page and try again.",
  invalid: "Orbit could not save this habit. Check the fields and try again.",
  not_found: "This habit no longer exists. It may have been deleted elsewhere.",
  conflict: "This habit is archived and read-only. Unarchive it to change it.",
  unavailable: "Orbit could not reach its server. Try again in a moment.",
  // The day left the window, usually because midnight passed while the page was open.
  windowClosed: "That day can no longer be changed. The page has been refreshed.",
  stillActive: "Archive this habit before deleting it.",
} as const;

export type HabitsApi = {
  create: (token: string, habit: NewHabit) => Promise<ApiResult<Habit>>;
  update: (token: string, id: string, changes: HabitChanges) => Promise<ApiResult<Habit>>;
  remove: (token: string, id: string) => Promise<ApiResult<undefined>>;
  setCheckIn: (
    token: string,
    id: string,
    day: Day,
    done: boolean,
  ) => Promise<ApiResult<undefined>>;
};

export function readHabitFields(formData: FormData): HabitFields {
  return { name: formText(formData, "name"), notes: formText(formData, "notes") };
}

/** Checks the fields; returns the habit to send, or the message to show. */
export function validateHabit(fields: HabitFields): NewHabit | string {
  if (!fields.name) return HABIT_ERRORS.nameMissing;
  if (textLength(fields.name) > HABIT_LIMITS.name) return HABIT_ERRORS.nameTooLong;
  if (textLength(fields.notes) > HABIT_LIMITS.notes) return HABIT_ERRORS.notesTooLong;
  return { name: fields.name, notes: fields.notes || null };
}

function failed(
  error: ApiError,
  fields?: HabitFields,
  overrides: Partial<ApiErrorMessages> = {},
): HabitFormState {
  return failedState(error, { ...HABIT_ERRORS, ...overrides }, fields);
}

export async function performAddHabit(
  formData: FormData,
  token: string | undefined,
  api: Pick<HabitsApi, "create">,
): Promise<HabitFormState> {
  if (!token) return SIGNED_OUT;
  const fields = readHabitFields(formData);
  const habit = validateHabit(fields);
  if (typeof habit === "string") return { status: "error", error: habit, fields };

  const result = await api.create(token, habit);
  if (!result.ok) return failed(result.error, fields);
  return { status: "success", message: `Added “${result.data.name}”.` };
}

export async function performEditHabit(
  formData: FormData,
  token: string | undefined,
  api: Pick<HabitsApi, "update">,
): Promise<HabitFormState> {
  if (!token) return SIGNED_OUT;
  const id = formText(formData, "id");
  if (!id) return { status: "error", error: HABIT_ERRORS.missingHabit };
  const fields = readHabitFields(formData);
  const habit = validateHabit(fields);
  if (typeof habit === "string") return { status: "error", error: habit, fields };

  // Sends both fields, so emptying the notes clears them.
  const result = await api.update(token, id, habit);
  if (!result.ok) return failed(result.error, fields);
  return { status: "success" };
}

/** Archives or restores; the form carries the state to switch to, so a repeat is harmless. */
export async function performArchiveHabit(
  formData: FormData,
  token: string | undefined,
  api: Pick<HabitsApi, "update">,
): Promise<HabitFormState> {
  if (!token) return SIGNED_OUT;
  const id = formText(formData, "id");
  if (!id) return { status: "error", error: HABIT_ERRORS.missingHabit };
  const archived = formText(formData, "archived") === "true";

  const result = await api.update(token, id, { archived });
  if (!result.ok) return failed(result.error);
  return {
    status: "success",
    message: archived ? `Archived “${result.data.name}”.` : `Restored “${result.data.name}”.`,
  };
}

export async function performDeleteHabit(
  formData: FormData,
  token: string | undefined,
  api: Pick<HabitsApi, "remove">,
): Promise<HabitFormState> {
  if (!token) return SIGNED_OUT;
  const id = formText(formData, "id");
  if (!id) return { status: "error", error: HABIT_ERRORS.missingHabit };

  const result = await api.remove(token, id);
  // Already gone is what the user wanted.
  if (!result.ok && result.error !== "not_found") {
    return failed(result.error, undefined, { conflict: HABIT_ERRORS.stillActive });
  }
  return { status: "success" };
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Marks one day done or not done; the form carries the state to switch to. */
export async function performCheckIn(
  formData: FormData,
  token: string | undefined,
  api: Pick<HabitsApi, "setCheckIn">,
): Promise<HabitFormState> {
  if (!token) return SIGNED_OUT;
  const id = formText(formData, "id");
  if (!id) return { status: "error", error: HABIT_ERRORS.missingHabit };
  const day = formText(formData, "day");
  if (!DAY_PATTERN.test(day)) return { status: "error", error: HABIT_ERRORS.missingDay };
  const done = formText(formData, "done") === "true";

  const result = await api.setCheckIn(token, id, day, done);
  if (!result.ok) return failed(result.error, undefined, { invalid: HABIT_ERRORS.windowClosed });
  return { status: "success" };
}

// Calendar dates from the API are parsed and formatted in UTC, so the web server's own
// timezone can never move a day to its neighbour (ADR 0008).

function toUtcDate(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: Day, days: number): Day {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDay(day: Day, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(toUtcDate(day));
}

/** "Sunday, 11 October 2026". */
export function formatLongDate(day: Day): string {
  return formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export type WeekDay = {
  day: Day;
  /** "Wed" */
  weekday: string;
  /** "8" */
  dayOfMonth: string;
  /** "Wednesday 8 October", for labels. */
  label: string;
  done: boolean;
  isToday: boolean;
};

/** The seven days a habit can be checked off, oldest first and ending today. */
export function buildWeek(today: Day, checkIns: Day[]): WeekDay[] {
  const done = new Set(checkIns);
  return Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const day = addDays(today, index - (WINDOW_DAYS - 1));
    return {
      day,
      weekday: formatDay(day, { weekday: "short" }),
      dayOfMonth: formatDay(day, { day: "numeric" }),
      label: formatDay(day, { weekday: "long", day: "numeric", month: "long" }),
      done: done.has(day),
      isToday: day === today,
    };
  });
}

/** "2 of 3 done today", for the list heading. */
export function summarize(habits: Pick<Habit, "checkIns">[], today: Day): string {
  if (habits.length === 0) return "No habits yet";
  const doneToday = habits.filter((habit) => habit.checkIns.includes(today)).length;
  return `${doneToday} of ${habits.length} done today`;
}

export type DayActivity = Omit<WeekDay, "done"> & {
  /** How many active habits were done that day. */
  done: number;
};

/** For each of the last seven days, how many of the given habits were done. */
export function weekActivity(habits: Pick<Habit, "checkIns">[], today: Day): DayActivity[] {
  return buildWeek(today, []).map((day) => ({
    ...day,
    done: habits.filter((habit) => habit.checkIns.includes(day.day)).length,
  }));
}
