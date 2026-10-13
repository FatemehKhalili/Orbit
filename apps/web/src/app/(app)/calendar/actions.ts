"use server";

import { redirect } from "next/navigation";

import { getSessionToken } from "@/lib/auth";
import {
  type EventFormState,
  performAddEvent,
  performDeleteEvent,
  performEditEvent,
} from "@/lib/calendar";
import { createEvent, deleteEvent, updateEvent } from "@/lib/calendar-api";
import { settleAction } from "@/lib/form-actions";

// Each action asks the API with the caller's own session token; the API decides what
// that session may see and change, and turns local days and times into instants
// (ADR 0007, ADR 0011). Nothing here trusts the page that rendered the form.

const CALENDAR_PATH = "/calendar";

// The forms live on three pages (agenda, edit, delete), and the Dashboard shows today's
// plans, so the whole layout is refreshed.
function settle(state: EventFormState): Promise<EventFormState> {
  return settleAction(state, CALENDAR_PATH, "layout");
}

export async function addEvent(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const token = await getSessionToken();
  return settle(await performAddEvent(formData, token, { create: createEvent }));
}

export async function editEvent(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const token = await getSessionToken();
  const state = await settle(await performEditEvent(formData, token, { update: updateEvent }));
  if (state.status === "success") redirect(CALENDAR_PATH);
  return state;
}

/** Only the confirmation page posts here, with `confirm=delete` (lib/calendar.ts). */
export async function deleteEventForGood(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const token = await getSessionToken();
  const state = await settle(await performDeleteEvent(formData, token, { remove: deleteEvent }));
  if (state.status === "success") redirect(CALENDAR_PATH);
  return state;
}
