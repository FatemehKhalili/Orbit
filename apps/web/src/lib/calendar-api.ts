/** Calls to the API's /calendar endpoints. Server-side only (ADR 0002). */

import {
  apiRequest,
  apiRequestWithMessage,
  type ApiOptions,
  type ApiResult,
  type ApiResultWithMessage,
} from "@/lib/api-client";
import type { Day } from "@/lib/time-api";

/** A local time of day as the API sends it, "09:00" (ADR 0011). */
export type TimeOfDay = string;

/**
 * An event as the pages need it. Days and times are local to the instance timezone and
 * come from the API, so the web app never converts a time (ADR 0008, ADR 0011).
 */
export type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  allDay: boolean;
  startDay: Day;
  /** Null when all day. */
  startTime: TimeOfDay | null;
  /** The last day of an all-day event (inclusive), or the day a timed event ends. */
  endDay: Day;
  /** Null when all day. */
  endTime: TimeOfDay | null;
  /** The first and last days the event is on, by the API's day rule. */
  firstDay: Day;
  lastDay: Day;
  createdAt: string;
  updatedAt: string;
};

/** The time an event takes, as the API accepts it. */
export type EventWhen =
  | { all_day: true; start_day: Day; end_day: Day | null }
  | {
      all_day: false;
      start_day: Day;
      start_time: TimeOfDay;
      end_day: Day | null;
      end_time: TimeOfDay | null;
    };

export type NewEvent = { title: string; notes: string | null; when: EventWhen };

export type EventChanges = Partial<NewEvent>;

type ApiEvent = {
  id: string;
  title: string;
  notes: string | null;
  all_day: boolean;
  start_day: Day;
  start_time: TimeOfDay | null;
  end_day: Day;
  end_time: TimeOfDay | null;
  starts_at: string | null;
  ends_at: string | null;
  first_day: Day;
  last_day: Day;
  created_at: string;
  updated_at: string;
};

const EVENTS = "/calendar/events";

function eventPath(id: string): string {
  return `${EVENTS}/${encodeURIComponent(id)}`;
}

function fromApi(event: ApiEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    allDay: event.all_day,
    startDay: event.start_day,
    startTime: event.start_time,
    endDay: event.end_day,
    endTime: event.end_time,
    firstDay: event.first_day,
    lastDay: event.last_day,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

function mapEvent<T, U>(result: ApiResult<T>, map: (data: T) => U): ApiResult<U>;
function mapEvent<T, U>(
  result: ApiResultWithMessage<T>,
  map: (data: T) => U,
): ApiResultWithMessage<U>;
function mapEvent<T, U>(
  result: ApiResultWithMessage<T>,
  map: (data: T) => U,
): ApiResultWithMessage<U> {
  return result.ok ? { ok: true, data: map(result.data) } : result;
}

/** Every event on any day from `from` to `to` (inclusive), all-day first, then by start. */
export async function listEvents(
  token: string,
  from: Day,
  to: Day,
  options: ApiOptions = {},
): Promise<ApiResult<CalendarEvent[]>> {
  const query = new URLSearchParams({ from, to });
  const result = await apiRequest<ApiEvent[]>(`${EVENTS}?${query}`, { token }, options);
  return mapEvent(result, (events) => events.map(fromApi));
}

export async function getEvent(
  token: string,
  id: string,
  options: ApiOptions = {},
): Promise<ApiResult<CalendarEvent>> {
  const result = await apiRequest<ApiEvent>(eventPath(id), { token }, options);
  return mapEvent(result, fromApi);
}

/** A refused event comes back with the API's reason as `message` (ADR 0011's rules). */
export async function createEvent(
  token: string,
  event: NewEvent,
  options: ApiOptions = {},
): Promise<ApiResultWithMessage<CalendarEvent>> {
  const result = await apiRequestWithMessage<ApiEvent>(
    EVENTS,
    { method: "POST", token, json: event },
    options,
  );
  return mapEvent(result, fromApi);
}

export async function updateEvent(
  token: string,
  id: string,
  changes: EventChanges,
  options: ApiOptions = {},
): Promise<ApiResultWithMessage<CalendarEvent>> {
  const result = await apiRequestWithMessage<ApiEvent>(
    eventPath(id),
    { method: "PATCH", token, json: changes },
    options,
  );
  return mapEvent(result, fromApi);
}

export async function deleteEvent(
  token: string,
  id: string,
  options: ApiOptions = {},
): Promise<ApiResult<undefined>> {
  return apiRequest<undefined>(eventPath(id), { method: "DELETE", token }, options);
}
