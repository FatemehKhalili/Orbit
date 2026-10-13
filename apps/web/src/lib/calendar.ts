/**
 * The Calendar's logic, without Next.js: reads and checks the event forms, calls the API
 * and decides what each form shows next, and lays events out in the seven-day agenda and
 * the Dashboard's "Today's plans". The Server Actions in app/(app)/calendar wire it to
 * cookies, revalidation and redirects.
 *
 * The API is the authority on validation, ownership and time: it turns local days and
 * times into instants in the instance timezone and says which days each event is on
 * (ADR 0011). The checks here only give quicker, friendlier messages, and the layout
 * only counts calendar dates, so the web server's own timezone never matters.
 */

import type { ApiError, ApiResult, ApiResultWithMessage } from "@/lib/api-client";
import type {
  CalendarEvent,
  EventChanges,
  EventWhen,
  NewEvent,
} from "@/lib/calendar-api";
import { addDays, daysBetween, formatDay } from "@/lib/days";
import {
  type ApiErrorMessages,
  failedState,
  formText,
  type FormState,
  IDLE,
  SIGNED_OUT,
  textLength,
} from "@/lib/forms";
import type { Day } from "@/lib/time-api";

/** Must match the API (apps/api/app/models/calendar.py and app/calendar/service.py). */
export const EVENT_LIMITS = { title: 200, notes: 8000, spanDays: 366 } as const;

/** The agenda shows this many days, and moves by as many. */
export const AGENDA_DAYS = 7;

/** The first day the API accepts (Python's date range, which ends on 9999-12-31). */
const FIRST_DAY = "0001-01-01";
/** The latest first day of a whole agenda: seven days ending on 9999-12-31. */
const LAST_AGENDA_START = "9999-12-25";

/** How many of today's events the Dashboard lists before "and N more today". */
export const TODAY_PLANS_LIMIT = 5;

export type EventFields = {
  title: string;
  notes: string;
  /** "true" when the "All day" box is ticked. */
  allDay: string;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
};

export type EventFormState = FormState<EventFields>;

export { IDLE };

export const EVENT_ERRORS = {
  titleMissing: "Enter a title for the event.",
  titleTooLong: `Keep the title to ${EVENT_LIMITS.title} characters or fewer.`,
  notesTooLong: `Keep the notes to ${EVENT_LIMITS.notes} characters or fewer.`,
  startDayMissing: "Choose the day the event starts.",
  startTimeMissing: "Choose the time the event starts, or tick “All day”.",
  endDayInvalid: "Choose a valid end day, or leave it empty.",
  endTimeInvalid: "Choose a valid end time, or leave it empty.",
  endDayWithoutTime: "Give an end time with the end day, or leave both empty.",
  endBeforeStart: "The end must not be before the start.",
  tooLong: `An event can last at most ${EVENT_LIMITS.spanDays} days.`,
  missingEvent: "Orbit could not tell which event to change. Reload the page and try again.",
  notConfirmed: "Confirm that you want to delete this event.",
  // When the API gives no reason of its own (it usually does: see failed()).
  invalid: "Orbit could not save this event. Check the days and times.",
  not_found: "This event no longer exists. It may have been deleted elsewhere.",
  conflict: "Orbit could not save this change. Reload the page and try again.",
  unavailable: "Orbit could not reach its server. Try again in a moment.",
} as const;

export type CalendarApi = {
  create: (token: string, event: NewEvent) => Promise<ApiResultWithMessage<CalendarEvent>>;
  update: (
    token: string,
    id: string,
    changes: EventChanges,
  ) => Promise<ApiResultWithMessage<CalendarEvent>>;
  remove: (token: string, id: string) => Promise<ApiResult<undefined>>;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar date written YYYY-MM-DD (not 2026-02-30), from 0001-01-01 on. */
export function isDay(value: string): value is Day {
  if (!DAY_PATTERN.test(value) || value < FIRST_DAY) return false;
  // "2026-13-01" is no date at all; "2026-02-30" rolls over to March.
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readEventFields(formData: FormData): EventFields {
  return {
    title: formText(formData, "title"),
    notes: formText(formData, "notes"),
    allDay: formData.get("allDay") ? "true" : "",
    startDay: formText(formData, "startDay"),
    startTime: formText(formData, "startTime"),
    endDay: formText(formData, "endDay"),
    endTime: formText(formData, "endTime"),
  };
}

/** The form's values for an existing event, to start the edit form with. */
export function eventFields(event: CalendarEvent): EventFields {
  const point =
    !event.allDay && event.startDay === event.endDay && event.startTime === event.endTime;
  return {
    title: event.title,
    notes: event.notes ?? "",
    allDay: event.allDay ? "true" : "",
    startDay: event.startDay,
    startTime: event.startTime ?? "",
    // A one-day event or a point in time leaves the end fields empty, as it was entered.
    endDay: event.endDay === event.startDay ? "" : event.endDay,
    endTime: point ? "" : (event.endTime ?? ""),
  };
}

const MINUTES_PER_DAY = 24 * 60;

/** "09:30" → 570. */
function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function checkWhen(fields: EventFields): EventWhen | string {
  if (!isDay(fields.startDay)) return EVENT_ERRORS.startDayMissing;
  if (fields.endDay && !isDay(fields.endDay)) return EVENT_ERRORS.endDayInvalid;
  const endDay = fields.endDay || null;

  if (fields.allDay) {
    const last = endDay ?? fields.startDay;
    const span = daysBetween(fields.startDay, last);
    if (span < 0) return EVENT_ERRORS.endBeforeStart;
    if (span + 1 > EVENT_LIMITS.spanDays) return EVENT_ERRORS.tooLong;
    return { all_day: true, start_day: fields.startDay, end_day: endDay };
  }

  if (!TIME_PATTERN.test(fields.startTime)) return EVENT_ERRORS.startTimeMissing;
  if (fields.endTime && !TIME_PATTERN.test(fields.endTime)) return EVENT_ERRORS.endTimeInvalid;
  if (!fields.endTime) {
    // An end day equal to the start day says nothing more; any other needs a time.
    if (endDay && endDay !== fields.startDay) return EVENT_ERRORS.endDayWithoutTime;
    return {
      all_day: false,
      start_day: fields.startDay,
      start_time: fields.startTime,
      end_day: null,
      end_time: null,
    };
  }
  const last = endDay ?? fields.startDay;
  const span = daysBetween(fields.startDay, last);
  // In minutes of local clock time. The API measures real time, which differs by an hour
  // across a clock change; its own message is shown when it refuses.
  const length = span * MINUTES_PER_DAY + minutes(fields.endTime) - minutes(fields.startTime);
  if (length < 0) return EVENT_ERRORS.endBeforeStart;
  if (length > EVENT_LIMITS.spanDays * MINUTES_PER_DAY) return EVENT_ERRORS.tooLong;
  return {
    all_day: false,
    start_day: fields.startDay,
    start_time: fields.startTime,
    end_day: endDay,
    end_time: fields.endTime,
  };
}

/** Checks the fields; returns the event to send, or the message to show. */
export function validateEvent(fields: EventFields): NewEvent | string {
  if (!fields.title) return EVENT_ERRORS.titleMissing;
  if (textLength(fields.title) > EVENT_LIMITS.title) return EVENT_ERRORS.titleTooLong;
  if (textLength(fields.notes) > EVENT_LIMITS.notes) return EVENT_ERRORS.notesTooLong;
  const when = checkWhen(fields);
  if (typeof when === "string") return when;
  return { title: fields.title, notes: fields.notes || null, when };
}

/** A refused save shows the API's reason when it gives one (a clock change, the limits). */
function failed(
  result: { error: ApiError; message?: string },
  fields?: EventFields,
): EventFormState {
  const state = failedState(result.error, EVENT_ERRORS satisfies ApiErrorMessages, fields);
  if (state.status === "error" && result.error === "invalid" && result.message) {
    return { ...state, error: result.message };
  }
  return state;
}

export async function performAddEvent(
  formData: FormData,
  token: string | undefined,
  api: Pick<CalendarApi, "create">,
): Promise<EventFormState> {
  if (!token) return SIGNED_OUT;
  const fields = readEventFields(formData);
  const event = validateEvent(fields);
  if (typeof event === "string") return { status: "error", error: event, fields };

  const result = await api.create(token, event);
  if (!result.ok) return failed(result, fields);
  return { status: "success", message: `Added “${result.data.title}”.` };
}

export async function performEditEvent(
  formData: FormData,
  token: string | undefined,
  api: Pick<CalendarApi, "update">,
): Promise<EventFormState> {
  if (!token) return SIGNED_OUT;
  const id = formText(formData, "id");
  if (!id) return { status: "error", error: EVENT_ERRORS.missingEvent };
  const fields = readEventFields(formData);
  const event = validateEvent(fields);
  if (typeof event === "string") return { status: "error", error: event, fields };

  // Sends every field, so emptying the notes clears them and the time is replaced whole.
  const result = await api.update(token, id, event);
  if (!result.ok) return failed(result, fields);
  return { status: "success" };
}

/**
 * Deletes an event for good. Only the confirmation page's form carries `confirm=delete`,
 * so a delete always takes two deliberate steps.
 */
export async function performDeleteEvent(
  formData: FormData,
  token: string | undefined,
  api: Pick<CalendarApi, "remove">,
): Promise<EventFormState> {
  if (!token) return SIGNED_OUT;
  const id = formText(formData, "id");
  if (!id) return { status: "error", error: EVENT_ERRORS.missingEvent };
  if (formText(formData, "confirm") !== "delete") {
    return { status: "error", error: EVENT_ERRORS.notConfirmed };
  }

  const result = await api.remove(token, id);
  // Already gone is what the user wanted.
  if (!result.ok && result.error !== "not_found") return failed(result);
  return { status: "success" };
}

/**
 * The agenda's first day: `?from=` when it is a real date, today otherwise. Near the
 * last day there is, it starts early enough to show seven whole days.
 */
export function agendaStart(from: string | string[] | undefined, today: Day): Day {
  const first = typeof from === "string" && isDay(from) ? from : today;
  return first > LAST_AGENDA_START ? LAST_AGENDA_START : first;
}

/**
 * Where Previous and Next lead: seven days back and on, stopping at the first and last
 * days there are. Null when there is nothing further that way.
 */
export function agendaNeighbours(first: Day): { previous: Day | null; next: Day | null } {
  const previous =
    first <= FIRST_DAY
      ? null
      : daysBetween(FIRST_DAY, first) < AGENDA_DAYS
        ? FIRST_DAY
        : addDays(first, -AGENDA_DAYS);
  const next =
    first >= LAST_AGENDA_START
      ? null
      : daysBetween(first, LAST_AGENDA_START) < AGENDA_DAYS
        ? LAST_AGENDA_START
        : addDays(first, AGENDA_DAYS);
  return { previous, next };
}

/** The last day of an agenda starting on `first`. */
export function agendaEnd(first: Day): Day {
  return addDays(first, AGENDA_DAYS - 1);
}

/** Whether the event is on `day`, by the API's day rule. */
export function isOn(event: Pick<CalendarEvent, "firstDay" | "lastDay">, day: Day): boolean {
  return event.firstDay <= day && day <= event.lastDay;
}

/**
 * What the agenda shows beside an event on one of its days: "All day", "09:00",
 * "09:00 – 10:15", or for a timed event over several days "From 22:30" on the first,
 * "Continues" in between and "Until 06:10" on the last.
 */
export function timeLabel(event: CalendarEvent, day: Day): string {
  if (event.allDay) return "All day";
  const first = day === event.firstDay;
  const last = day === event.lastDay;
  // Ending exactly at midnight: the last day it is on ends with it.
  const endTime = day === event.endDay ? event.endTime : "24:00";
  if (first && last) {
    if (event.startDay === event.endDay && event.startTime === event.endTime) {
      return event.startTime ?? "";
    }
    return `${event.startTime} – ${endTime}`;
  }
  if (first) return `From ${event.startTime}`;
  if (last) return `Until ${endTime}`;
  return "Continues";
}

export type AgendaDay = {
  day: Day;
  /** "Wednesday 14 October" */
  label: string;
  isToday: boolean;
  /** The day's events in the API's order: all-day first, then by start. */
  events: { event: CalendarEvent; time: string }[];
};

/** The agenda's days from `first`, every day listed, each with the events on it. */
export function buildAgenda(first: Day, today: Day, events: CalendarEvent[]): AgendaDay[] {
  return Array.from({ length: AGENDA_DAYS }, (_, index) => {
    const day = addDays(first, index);
    return {
      day,
      label: formatDay(day, { weekday: "long", day: "numeric", month: "long" }),
      isToday: day === today,
      events: events
        .filter((event) => isOn(event, day))
        .map((event) => ({ event, time: timeLabel(event, day) })),
    };
  });
}

/** "14 – 20 October 2026", or across months "28 October – 3 November 2026". */
export function rangeLabel(first: Day): string {
  const last = agendaEnd(first);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const sameMonth = sameYear && first.slice(0, 7) === last.slice(0, 7);
  const startOptions: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric" }
    : sameYear
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };
  const start = formatDay(first, startOptions);
  return `${start} – ${formatDay(last, { day: "numeric", month: "long", year: "numeric" })}`;
}

export type TodayPlans = {
  /** Today's first events, in agenda order. */
  shown: { event: CalendarEvent; time: string }[];
  /** Today's events not shown. */
  remaining: number;
  /** Events on any day from today to six days on, as /calendar shows by default. */
  week: number;
};

/**
 * The Dashboard's "Today's plans", from the events of the seven days starting today
 * (the same request and order /calendar uses).
 */
export function todayPlans(
  weekEvents: CalendarEvent[],
  today: Day,
  limit = TODAY_PLANS_LIMIT,
): TodayPlans {
  const todays = weekEvents.filter((event) => isOn(event, today));
  const shown = todays.slice(0, Math.max(0, limit));
  return {
    shown: shown.map((event) => ({ event, time: timeLabel(event, today) })),
    remaining: todays.length - shown.length,
    week: weekEvents.length,
  };
}

/** "3 plans in the next 7 days", for the Dashboard link. */
export function weekPlansLabel(count: number): string {
  return `${count} ${count === 1 ? "plan" : "plans"} in the next ${AGENDA_DAYS} days`;
}

/** "and 2 more today". */
export function moreTodayLabel(remaining: number): string {
  return `and ${remaining} more today`;
}
