import { describe, expect, it, vi } from "vitest";

import {
  createHabit,
  deleteHabit,
  getHabit,
  getTime,
  listHabits,
  setCheckIn,
  updateHabit,
} from "./habits-api";

const env = { ORBIT_API_URL: "http://api:8000" };

const apiHabit = {
  id: "8a1c6f9e-0000-4000-8000-000000000001",
  name: "Read",
  notes: null,
  archived: false,
  archived_at: null,
  check_ins: ["2026-10-09", "2026-10-11"],
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T10:05:00Z",
};

const habit = {
  id: apiHabit.id,
  name: "Read",
  notes: null,
  archived: false,
  archivedAt: null,
  checkIns: ["2026-10-09", "2026-10-11"],
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:05:00Z",
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

const HABITS = "http://api:8000/habits/habits";

describe("habits API calls", () => {
  it("reads the instance's timezone and today's date", async () => {
    const fetchImpl = respondWith(200, { timezone: "Europe/Berlin", today: "2026-10-11" });

    expect(await getTime("tok", { env, fetchImpl })).toEqual({
      ok: true,
      data: { timezone: "Europe/Berlin", today: "2026-10-11" },
    });
    expect(request(fetchImpl)).toEqual({
      url: "http://api:8000/time",
      method: "GET",
      authorization: "Bearer tok",
      body: undefined,
    });
  });

  it("lists the active habits with the session token", async () => {
    const fetchImpl = respondWith(200, [apiHabit]);

    expect(await listHabits("tok", {}, { env, fetchImpl })).toEqual({ ok: true, data: [habit] });
    expect(request(fetchImpl)).toEqual({
      url: HABITS,
      method: "GET",
      authorization: "Bearer tok",
      body: undefined,
    });
  });

  it("lists the archived habits", async () => {
    const archived = { ...apiHabit, archived: true, archived_at: "2026-10-10T08:00:00Z" };
    const fetchImpl = respondWith(200, [archived]);

    expect(await listHabits("tok", { archived: true }, { env, fetchImpl })).toEqual({
      ok: true,
      data: [{ ...habit, archived: true, archivedAt: "2026-10-10T08:00:00Z" }],
    });
    expect(request(fetchImpl).url).toBe(`${HABITS}?archived=true`);
  });

  it("gets one habit, with its ID encoded into the path", async () => {
    const fetchImpl = respondWith(200, apiHabit);
    expect(await getHabit("tok", habit.id, { env, fetchImpl })).toEqual({ ok: true, data: habit });
    expect(request(fetchImpl).url).toBe(`${HABITS}/${habit.id}`);

    const probe = respondWith(404, { detail: "Habit not found" });
    expect(await getHabit("tok", "../../auth/me", { env, fetchImpl: probe })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(request(probe).url).toBe(`${HABITS}/..%2F..%2Fauth%2Fme`);
  });

  it("creates a habit", async () => {
    const fetchImpl = respondWith(201, apiHabit);
    const input = { name: "Read", notes: null };

    expect(await createHabit("tok", input, { env, fetchImpl })).toEqual({ ok: true, data: habit });
    expect(request(fetchImpl)).toMatchObject({ url: HABITS, method: "POST", body: input });
  });

  it("updates only the given fields", async () => {
    const fetchImpl = respondWith(200, { ...apiHabit, archived: true });

    const result = await updateHabit("tok", habit.id, { archived: true }, { env, fetchImpl });

    expect(result).toEqual({ ok: true, data: { ...habit, archived: true } });
    expect(request(fetchImpl)).toMatchObject({
      url: `${HABITS}/${habit.id}`,
      method: "PATCH",
      body: { archived: true },
    });
  });

  it("deletes a habit", async () => {
    const fetchImpl = respondWith(204);

    expect(await deleteHabit("tok", habit.id, { env, fetchImpl })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(request(fetchImpl)).toMatchObject({ url: `${HABITS}/${habit.id}`, method: "DELETE" });
  });

  it.each([
    [true, "PUT"],
    [false, "DELETE"],
  ])("sets a check-in to done=%s with %s", async (done, method) => {
    const fetchImpl = respondWith(204);

    expect(await setCheckIn("tok", habit.id, "2026-10-11", done, { env, fetchImpl })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(request(fetchImpl)).toEqual({
      url: `${HABITS}/${habit.id}/check-ins/2026-10-11`,
      method,
      authorization: "Bearer tok",
      body: undefined,
    });
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [409, "conflict"],
    [422, "invalid"],
    [503, "unavailable"],
  ])("passes a %s through as %s", async (status, error) => {
    const fetchImpl = respondWith(status, { detail: "x" });

    expect(await setCheckIn("tok", habit.id, "2026-10-01", true, { env, fetchImpl })).toEqual({
      ok: false,
      error,
    });
  });
});
