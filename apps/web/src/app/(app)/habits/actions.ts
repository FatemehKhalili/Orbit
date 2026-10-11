"use server";

import { redirect } from "next/navigation";

import { getSessionToken } from "@/lib/auth";
import { settleAction } from "@/lib/form-actions";
import {
  type HabitFormState,
  performAddHabit,
  performArchiveHabit,
  performCheckIn,
  performDeleteHabit,
  performEditHabit,
} from "@/lib/habits";
import { createHabit, deleteHabit, setCheckIn, updateHabit } from "@/lib/habits-api";

// Each action asks the API with the caller's own session token; the API decides what
// that session may see and change, including archived habits and the check-in window
// (ADR 0007, ADR 0008). Nothing here trusts the page that rendered the form.

const HABITS_PATH = "/habits";
const ARCHIVED_PATH = "/habits/archived";

// The forms live on three pages (list, edit, archived), so all of them are refreshed.
function settle(state: HabitFormState): Promise<HabitFormState> {
  return settleAction(state, HABITS_PATH, "layout");
}

export async function addHabit(
  _previous: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const token = await getSessionToken();
  return settle(await performAddHabit(formData, token, { create: createHabit }));
}

export async function editHabit(
  _previous: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const token = await getSessionToken();
  const state = await settle(await performEditHabit(formData, token, { update: updateHabit }));
  if (state.status === "success") redirect(HABITS_PATH);
  return state;
}

export async function archiveHabit(
  _previous: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const token = await getSessionToken();
  return settle(await performArchiveHabit(formData, token, { update: updateHabit }));
}

export async function deleteHabitForGood(
  _previous: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const token = await getSessionToken();
  const state = await settle(await performDeleteHabit(formData, token, { remove: deleteHabit }));
  // From the edit page the habit is gone, so land on the archived list either way.
  if (state.status === "success") redirect(ARCHIVED_PATH);
  return state;
}

export async function checkIn(
  _previous: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const token = await getSessionToken();
  return settle(await performCheckIn(formData, token, { setCheckIn }));
}
