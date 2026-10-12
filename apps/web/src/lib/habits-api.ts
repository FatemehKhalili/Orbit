/** Calls to the API's /habits endpoints. Server-side only (ADR 0002). */

import { apiRequest, type ApiOptions, type ApiResult } from "@/lib/api-client";
import type { Day } from "@/lib/time-api";

export type Habit = {
  id: string;
  name: string;
  notes: string | null;
  archived: boolean;
  archivedAt: string | null;
  /** The days inside the current seven-day window when the habit was done, oldest first. */
  checkIns: Day[];
  createdAt: string;
  updatedAt: string;
};

export type NewHabit = { name: string; notes: string | null };

export type HabitChanges = Partial<NewHabit & { archived: boolean }>;

type ApiHabit = Omit<Habit, "archivedAt" | "checkIns" | "createdAt" | "updatedAt"> & {
  archived_at: string | null;
  check_ins: Day[];
  created_at: string;
  updated_at: string;
};

const HABITS = "/habits/habits";

function habitPath(id: string): string {
  return `${HABITS}/${encodeURIComponent(id)}`;
}

function checkInPath(id: string, day: Day): string {
  return `${habitPath(id)}/check-ins/${encodeURIComponent(day)}`;
}

function fromApi({ archived_at, check_ins, created_at, updated_at, ...habit }: ApiHabit): Habit {
  return {
    ...habit,
    archivedAt: archived_at,
    checkIns: check_ins,
    createdAt: created_at,
    updatedAt: updated_at,
  };
}

function mapHabit<T, U>(result: ApiResult<T>, map: (data: T) => U): ApiResult<U> {
  return result.ok ? { ok: true, data: map(result.data) } : result;
}

/**
 * The owner's active habits, oldest first, or with `archived` their archived habits,
 * most recently archived first.
 */
export async function listHabits(
  token: string,
  { archived = false }: { archived?: boolean } = {},
  options: ApiOptions = {},
): Promise<ApiResult<Habit[]>> {
  const result = await apiRequest<ApiHabit[]>(
    archived ? `${HABITS}?archived=true` : HABITS,
    { token },
    options,
  );
  return mapHabit(result, (habits) => habits.map(fromApi));
}

export async function getHabit(
  token: string,
  id: string,
  options: ApiOptions = {},
): Promise<ApiResult<Habit>> {
  return mapHabit(await apiRequest<ApiHabit>(habitPath(id), { token }, options), fromApi);
}

export async function createHabit(
  token: string,
  habit: NewHabit,
  options: ApiOptions = {},
): Promise<ApiResult<Habit>> {
  const result = await apiRequest<ApiHabit>(
    HABITS,
    { method: "POST", token, json: habit },
    options,
  );
  return mapHabit(result, fromApi);
}

export async function updateHabit(
  token: string,
  id: string,
  changes: HabitChanges,
  options: ApiOptions = {},
): Promise<ApiResult<Habit>> {
  const result = await apiRequest<ApiHabit>(
    habitPath(id),
    { method: "PATCH", token, json: changes },
    options,
  );
  return mapHabit(result, fromApi);
}

/** Deletes an archived habit and its check-ins for good; an active one is a conflict. */
export async function deleteHabit(
  token: string,
  id: string,
  options: ApiOptions = {},
): Promise<ApiResult<undefined>> {
  return apiRequest<undefined>(habitPath(id), { method: "DELETE", token }, options);
}

/** Marks the habit done on `day`, or with `done: false` not done. Repeating is harmless. */
export async function setCheckIn(
  token: string,
  id: string,
  day: Day,
  done: boolean,
  options: ApiOptions = {},
): Promise<ApiResult<undefined>> {
  return apiRequest<undefined>(
    checkInPath(id, day),
    { method: done ? "PUT" : "DELETE", token },
    options,
  );
}
