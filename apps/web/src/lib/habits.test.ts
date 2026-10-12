import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "./api-client";
import {
  addDays,
  allDoneToday,
  buildWeek,
  countDoneToday,
  formatLongDate,
  HABIT_ERRORS,
  performAddHabit,
  performArchiveHabit,
  performCheckIn,
  performDeleteHabit,
  performEditHabit,
  readHabitFields,
  summarize,
  validateHabit,
  weekActivity,
} from "./habits";
import type { Habit } from "./habits-api";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const saved: Habit = {
  id: "habit-1",
  name: "Read",
  notes: null,
  archived: false,
  archivedAt: null,
  checkIns: [],
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:00:00Z",
};

const succeed = <T>(data: T) => vi.fn().mockResolvedValue({ ok: true, data });
const fail = (error: ApiError) => vi.fn().mockResolvedValue({ ok: false, error });

describe("readHabitFields and validateHabit", () => {
  it("trims the fields and turns blank notes into null", () => {
    const fields = readHabitFields(form({ name: "  Read ", notes: " " }));

    expect(fields).toEqual({ name: "Read", notes: "" });
    expect(validateHabit(fields)).toEqual({ name: "Read", notes: null });
  });

  it.each([
    [{ name: "", notes: "" }, HABIT_ERRORS.nameMissing],
    [{ name: "x".repeat(101), notes: "" }, HABIT_ERRORS.nameTooLong],
    [{ name: "Read", notes: "x".repeat(1001) }, HABIT_ERRORS.notesTooLong],
  ])("refuses %j", (fields, error) => {
    expect(validateHabit(fields)).toBe(error);
  });

  it("accepts the longest allowed values, counting an emoji as one character", () => {
    expect(validateHabit({ name: "🏃".repeat(100), notes: "x".repeat(1000) })).toEqual({
      name: "🏃".repeat(100),
      notes: "x".repeat(1000),
    });
    expect(validateHabit({ name: "🏃".repeat(101), notes: "" })).toBe(HABIT_ERRORS.nameTooLong);
  });
});

describe("performAddHabit", () => {
  it("creates the habit and confirms it", async () => {
    const create = succeed(saved);

    const state = await performAddHabit(form({ name: " Read ", notes: "10 pages" }), "tok", {
      create,
    });

    expect(create).toHaveBeenCalledWith("tok", { name: "Read", notes: "10 pages" });
    expect(state).toEqual({ status: "success", message: "Added “Read”." });
  });

  it("keeps what was typed and does not call the API when the name is missing", async () => {
    const create = succeed(saved);

    const state = await performAddHabit(form({ name: " ", notes: "x" }), "tok", { create });

    expect(state).toEqual({
      status: "error",
      error: HABIT_ERRORS.nameMissing,
      fields: { name: "", notes: "x" },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each<[ApiError, string]>([
    ["invalid", HABIT_ERRORS.invalid],
    ["unavailable", HABIT_ERRORS.unavailable],
  ])("explains a %s failure and keeps the fields", async (error, message) => {
    const state = await performAddHabit(form({ name: "Read" }), "tok", { create: fail(error) });

    expect(state).toMatchObject({ status: "error", error: message, fields: { name: "Read" } });
  });

  it("signs out when there is no session or the API rejects it", async () => {
    const create = succeed(saved);
    expect(await performAddHabit(form({ name: "Read" }), undefined, { create })).toEqual({
      status: "signed_out",
    });
    expect(create).not.toHaveBeenCalled();

    expect(
      await performAddHabit(form({ name: "Read" }), "tok", { create: fail("unauthenticated") }),
    ).toEqual({ status: "signed_out" });
  });
});

describe("performEditHabit", () => {
  it("sends both fields, so emptied notes are cleared", async () => {
    const update = succeed(saved);

    const state = await performEditHabit(form({ id: "habit-1", name: "Read", notes: "" }), "tok", {
      update,
    });

    expect(update).toHaveBeenCalledWith("tok", "habit-1", { name: "Read", notes: null });
    expect(state).toEqual({ status: "success" });
  });

  it("needs the habit's ID and a valid name", async () => {
    const update = succeed(saved);

    expect(await performEditHabit(form({ name: "Read" }), "tok", { update })).toEqual({
      status: "error",
      error: HABIT_ERRORS.missingHabit,
    });
    expect(await performEditHabit(form({ id: "habit-1" }), "tok", { update })).toMatchObject({
      status: "error",
      error: HABIT_ERRORS.nameMissing,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it.each<[ApiError, string]>([
    ["not_found", HABIT_ERRORS.not_found],
    ["conflict", HABIT_ERRORS.conflict],
  ])("explains a %s failure and keeps the fields", async (error, message) => {
    const state = await performEditHabit(form({ id: "habit-1", name: "Run" }), "tok", {
      update: fail(error),
    });

    expect(state).toEqual({
      status: "error",
      error: message,
      fields: { name: "Run", notes: "" },
    });
  });

  it("signs out without a session", async () => {
    const update = succeed(saved);
    expect(await performEditHabit(form({ id: "habit-1", name: "Read" }), undefined, { update }))
      .toEqual({ status: "signed_out" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("performArchiveHabit", () => {
  it.each([
    ["true", true, "Archived “Read”."],
    ["false", false, "Restored “Read”."],
  ])("sends archived=%s and confirms it", async (value, archived, message) => {
    const update = succeed({ ...saved, archived });

    const state = await performArchiveHabit(form({ id: "habit-1", archived: value }), "tok", {
      update,
    });

    expect(update).toHaveBeenCalledWith("tok", "habit-1", { archived });
    expect(state).toEqual({ status: "success", message });
  });

  it("needs the habit's ID and passes failures on", async () => {
    const update = succeed(saved);
    expect(await performArchiveHabit(form({ archived: "true" }), "tok", { update })).toEqual({
      status: "error",
      error: HABIT_ERRORS.missingHabit,
    });
    expect(update).not.toHaveBeenCalled();

    expect(
      await performArchiveHabit(form({ id: "habit-1", archived: "true" }), "tok", {
        update: fail("not_found"),
      }),
    ).toEqual({ status: "error", error: HABIT_ERRORS.not_found });
    expect(
      await performArchiveHabit(form({ id: "habit-1" }), undefined, { update }),
    ).toEqual({ status: "signed_out" });
  });
});

describe("performDeleteHabit", () => {
  it("deletes the habit", async () => {
    const remove = succeed(undefined);

    expect(await performDeleteHabit(form({ id: "habit-1" }), "tok", { remove })).toEqual({
      status: "success",
    });
    expect(remove).toHaveBeenCalledWith("tok", "habit-1");
  });

  it("treats a habit that is already gone as deleted", async () => {
    const state = await performDeleteHabit(form({ id: "habit-1" }), "tok", {
      remove: fail("not_found"),
    });

    expect(state).toEqual({ status: "success" });
  });

  it("explains that an active habit must be archived first", async () => {
    const state = await performDeleteHabit(form({ id: "habit-1" }), "tok", {
      remove: fail("conflict"),
    });

    expect(state).toEqual({ status: "error", error: HABIT_ERRORS.stillActive });
  });

  it("needs the habit's ID and a session", async () => {
    const remove = succeed(undefined);
    expect(await performDeleteHabit(form({}), "tok", { remove })).toEqual({
      status: "error",
      error: HABIT_ERRORS.missingHabit,
    });
    expect(await performDeleteHabit(form({ id: "habit-1" }), undefined, { remove })).toEqual({
      status: "signed_out",
    });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("performCheckIn", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])("sends done=%s for the day", async (value, done) => {
    const setCheckIn = succeed(undefined);

    const state = await performCheckIn(
      form({ id: "habit-1", day: "2026-10-11", done: value }),
      "tok",
      { setCheckIn },
    );

    expect(setCheckIn).toHaveBeenCalledWith("tok", "habit-1", "2026-10-11", done);
    expect(state).toEqual({ status: "success" });
  });

  it.each([
    [{ day: "2026-10-11", done: "true" }, HABIT_ERRORS.missingHabit],
    [{ id: "habit-1", done: "true" }, HABIT_ERRORS.missingDay],
    [{ id: "habit-1", day: "../../x", done: "true" }, HABIT_ERRORS.missingDay],
  ])("refuses %j without calling the API", async (fields, error) => {
    const setCheckIn = succeed(undefined);

    expect(await performCheckIn(form(fields), "tok", { setCheckIn })).toEqual({
      status: "error",
      error,
    });
    expect(setCheckIn).not.toHaveBeenCalled();
  });

  it.each<[ApiError, string]>([
    ["invalid", HABIT_ERRORS.windowClosed],
    ["conflict", HABIT_ERRORS.conflict],
    ["not_found", HABIT_ERRORS.not_found],
    ["unavailable", HABIT_ERRORS.unavailable],
  ])("explains a %s failure", async (error, message) => {
    const state = await performCheckIn(
      form({ id: "habit-1", day: "2026-10-04", done: "true" }),
      "tok",
      { setCheckIn: fail(error) },
    );

    expect(state).toEqual({ status: "error", error: message });
  });

  it("signs out when there is no session or the API rejects it", async () => {
    const fields = form({ id: "habit-1", day: "2026-10-11", done: "true" });
    expect(await performCheckIn(fields, undefined, { setCheckIn: succeed(undefined) })).toEqual({
      status: "signed_out",
    });
    expect(await performCheckIn(fields, "tok", { setCheckIn: fail("unauthenticated") })).toEqual({
      status: "signed_out",
    });
  });
});

describe("dates and the seven-day strip", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("builds the seven days ending today, oldest first", () => {
    const week = buildWeek("2026-10-11", ["2026-10-05", "2026-10-11", "2026-10-01"]);

    expect(week.map((day) => day.day)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(week.filter((day) => day.done).map((day) => day.day)).toEqual([
      "2026-10-05",
      "2026-10-11",
    ]);
    expect(week.filter((day) => day.isToday).map((day) => day.day)).toEqual(["2026-10-11"]);
    expect(week[3]).toMatchObject({
      weekday: "Thu",
      dayOfMonth: "8",
      label: "Thursday 8 October",
    });
  });

  // The API's dates are calendar dates: a web server far from UTC must not shift them.
  it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"])(
    "labels the same days when the server runs in %s",
    (zone) => {
      vi.stubEnv("TZ", zone);
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);

      expect(formatLongDate("2026-10-11")).toBe("Sunday, 11 October 2026");
      expect(buildWeek("2026-10-11", [])[0]).toMatchObject({
        day: "2026-10-05",
        label: "Monday 5 October",
      });
    },
  );

  it("summarizes today's progress", () => {
    expect(summarize([], "2026-10-11")).toBe("No habits yet");
    expect(
      summarize(
        [{ checkIns: ["2026-10-11"] }, { checkIns: ["2026-10-10"] }, { checkIns: [] }],
        "2026-10-11",
      ),
    ).toBe("1 of 3 done today");
  });
});

describe("weekActivity", () => {
  it("counts the habits done on each of the last seven days, ending today", () => {
    const habits = [
      { checkIns: ["2026-10-05", "2026-10-11"] },
      { checkIns: ["2026-10-11"] },
      { checkIns: [] },
    ];
    const week = weekActivity(habits, "2026-10-11");

    expect(week.map((day) => [day.day, day.done])).toEqual([
      ["2026-10-05", 1],
      ["2026-10-06", 0],
      ["2026-10-07", 0],
      ["2026-10-08", 0],
      ["2026-10-09", 0],
      ["2026-10-10", 0],
      ["2026-10-11", 2],
    ]);
    expect(week.at(-1)).toMatchObject({ weekday: "Sun", isToday: true });
  });
});

describe("countDoneToday and allDoneToday", () => {
  const today = "2026-10-11";

  it("count only check-ins on today", () => {
    const habits = [{ checkIns: ["2026-10-10", today] }, { checkIns: ["2026-10-10"] }];
    expect(countDoneToday(habits, today)).toBe(1);
    expect(allDoneToday(habits, today)).toBe(false);
  });

  it("are all done when every habit was checked off today", () => {
    expect(allDoneToday([{ checkIns: [today] }, { checkIns: [today] }], today)).toBe(true);
  });

  it("are never all done without habits", () => {
    expect(countDoneToday([], today)).toBe(0);
    expect(allDoneToday([], today)).toBe(false);
  });
});

describe("weekActivity edge cases", () => {
  it("is seven empty days without habits", () => {
    const week = weekActivity([], "2026-10-11");
    expect(week).toHaveLength(7);
    expect(week.every((day) => day.done === 0)).toBe(true);
  });

  it("ignores check-ins outside the window", () => {
    const week = weekActivity([{ checkIns: ["2026-10-04", "2026-10-12"] }], "2026-10-11");
    expect(week.every((day) => day.done === 0)).toBe(true);
  });
});
