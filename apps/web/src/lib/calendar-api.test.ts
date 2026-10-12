import { describe, expect, it, vi } from "vitest";

import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from "./calendar-api";

const env = { ORBIT_API_URL: "http://api:8000" };

const apiEvent = {
  id: "5b2f0c1e-0000-4000-8000-000000000001",
  title: "Dentist",
  notes: null,
  all_day: false,
  start_day: "2026-10-14",
  start_time: "09:00",
  end_day: "2026-10-14",
  end_time: "09:45",
  starts_at: "2026-10-14T07:00:00Z",
  ends_at: "2026-10-14T07:45:00Z",
  first_day: "2026-10-14",
  last_day: "2026-10-14",
  created_at: "2026-10-12T10:00:00Z",
  updated_at: "2026-10-12T10:05:00Z",
};

const event = {
  id: apiEvent.id,
  title: "Dentist",
  notes: null,
  allDay: false,
  startDay: "2026-10-14",
  startTime: "09:00",
  endDay: "2026-10-14",
  endTime: "09:45",
  firstDay: "2026-10-14",
  lastDay: "2026-10-14",
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:05:00Z",
};

function respondWith(status: number, body?: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
}

function request(fetchImpl: ReturnType<typeof respondWith>) {
  const [url, init] = fetchImpl.mock.calls[0];
  const headers = init?.headers as Record<string, string>;
  return {
    url,
    method: init?.method ?? "GET",
    authorization: headers.Authorization,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

const EVENTS = "http://api:8000/calendar/events";

describe("calendar API calls", () => {
  it("lists the events of a range of days with the session token", async () => {
    const fetchImpl = respondWith(200, [apiEvent]);

    expect(await listEvents("tok", "2026-10-12", "2026-10-18", { env, fetchImpl })).toEqual({
      ok: true,
      data: [event],
    });
    expect(request(fetchImpl)).toEqual({
      url: `${EVENTS}?from=2026-10-12&to=2026-10-18`,
      method: "GET",
      authorization: "Bearer tok",
      body: undefined,
    });
  });

  it("gets one event, escaping its id", async () => {
    const fetchImpl = respondWith(200, apiEvent);

    expect(await getEvent("tok", "a/b", { env, fetchImpl })).toEqual({ ok: true, data: event });
    expect(request(fetchImpl).url).toBe(`${EVENTS}/a%2Fb`);
  });

  it("creates an event with the API's field names", async () => {
    const fetchImpl = respondWith(201, apiEvent);
    const body = {
      title: "Dentist",
      notes: null,
      when: {
        all_day: false as const,
        start_day: "2026-10-14",
        start_time: "09:00",
        end_day: null,
        end_time: "09:45",
      },
    };

    expect(await createEvent("tok", body, { env, fetchImpl })).toEqual({ ok: true, data: event });
    expect(request(fetchImpl)).toEqual({
      url: EVENTS,
      method: "POST",
      authorization: "Bearer tok",
      body,
    });
  });

  it("updates an event with PATCH", async () => {
    const fetchImpl = respondWith(200, { ...apiEvent, title: "Dentist (moved)" });

    expect(await updateEvent("tok", apiEvent.id, { title: "Dentist (moved)" }, { env, fetchImpl }))
      .toEqual({ ok: true, data: { ...event, title: "Dentist (moved)" } });
    expect(request(fetchImpl)).toMatchObject({
      url: `${EVENTS}/${apiEvent.id}`,
      method: "PATCH",
      body: { title: "Dentist (moved)" },
    });
  });

  it("deletes an event", async () => {
    const fetchImpl = respondWith(204);

    expect(await deleteEvent("tok", apiEvent.id, { env, fetchImpl })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(request(fetchImpl)).toMatchObject({ url: `${EVENTS}/${apiEvent.id}`, method: "DELETE" });
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [422, "invalid"],
    [503, "unavailable"],
  ])("maps HTTP %i to %s", async (status, error) => {
    const fetchImpl = respondWith(status, { detail: "x" });

    expect(await getEvent("tok", apiEvent.id, { env, fetchImpl })).toEqual({ ok: false, error });
  });
});
