import { describe, expect, it, vi } from "vitest";

import type { ApiError } from "./api-client";
import {
  agendaEnd,
  agendaNeighbours,
  agendaStart,
  buildAgenda,
  EVENT_ERRORS,
  type EventFields,
  eventFields,
  isDay,
  moreTodayLabel,
  performAddEvent,
  performDeleteEvent,
  performEditEvent,
  rangeLabel,
  readEventFields,
  timeLabel,
  todayPlans,
  validateEvent,
  weekPlansLabel,
} from "./calendar";
import type { CalendarEvent } from "./calendar-api";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const empty: EventFields = {
  title: "",
  notes: "",
  allDay: "",
  startDay: "",
  startTime: "",
  endDay: "",
  endTime: "",
};

function fields(values: Partial<EventFields>): EventFields {
  return { ...empty, title: "Dentist", ...values };
}

function makeEvent(values: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "event-1",
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
    updatedAt: "2026-10-12T10:00:00Z",
    ...values,
  };
}

const allDay = (start: string, end: string, values: Partial<CalendarEvent> = {}) =>
  makeEvent({
    allDay: true,
    startDay: start,
    startTime: null,
    endDay: end,
    endTime: null,
    firstDay: start,
    lastDay: end,
    ...values,
  });

const succeed = <T>(data: T) => vi.fn().mockResolvedValue({ ok: true, data });
const fail = (error: ApiError) => vi.fn().mockResolvedValue({ ok: false, error });

describe("isDay", () => {
  it.each(["2026-10-14", "2028-02-29", "0001-01-01", "9999-12-31"])("accepts %s", (value) => {
    expect(isDay(value)).toBe(true);
  });

  it.each([
    "",
    "2026-02-30",
    "2026-13-01",
    "2026-1-01",
    "14/10/2026",
    "2026-10-14T00:00",
    "0000-12-31",
    "10000-01-01",
  ])(
    "refuses %j",
    (value) => {
      expect(isDay(value)).toBe(false);
    },
  );
});

describe("readEventFields and validateEvent", () => {
  it("reads a timed event, trimming text and turning blank notes into null", () => {
    const read = readEventFields(
      form({ title: "  Dentist ", notes: " ", startDay: "2026-10-14", startTime: "09:00" }),
    );

    expect(read).toEqual(fields({ startDay: "2026-10-14", startTime: "09:00" }));
    expect(validateEvent(read)).toEqual({
      title: "Dentist",
      notes: null,
      when: {
        all_day: false,
        start_day: "2026-10-14",
        start_time: "09:00",
        end_day: null,
        end_time: null,
      },
    });
  });

  it("reads the All day box and ignores the times then", () => {
    const read = readEventFields(
      form({ title: "Trip", allDay: "on", startDay: "2026-10-20", startTime: "09:00" }),
    );

    expect(read.allDay).toBe("true");
    expect(validateEvent(read)).toEqual({
      title: "Trip",
      notes: null,
      when: { all_day: true, start_day: "2026-10-20", end_day: null },
    });
  });

  it("keeps an end day and time", () => {
    const event = validateEvent(
      fields({
        startDay: "2026-10-14",
        startTime: "22:30",
        endDay: "2026-10-15",
        endTime: "06:10",
      }),
    );

    expect(event).toMatchObject({
      when: { start_time: "22:30", end_day: "2026-10-15", end_time: "06:10" },
    });
  });

  it("accepts an end day equal to the start day without an end time", () => {
    expect(
      validateEvent(fields({ startDay: "2026-10-14", startTime: "09:00", endDay: "2026-10-14" })),
    ).toMatchObject({ when: { end_day: null, end_time: null } });
  });

  it.each([
    [{ title: "" }, EVENT_ERRORS.titleMissing],
    [{ title: "x".repeat(201) }, EVENT_ERRORS.titleTooLong],
    [{ notes: "x".repeat(8001) }, EVENT_ERRORS.notesTooLong],
    [{ startDay: "" }, EVENT_ERRORS.startDayMissing],
    [{ startDay: "2026-02-30" }, EVENT_ERRORS.startDayMissing],
    [{ startDay: "2026-10-14" }, EVENT_ERRORS.startTimeMissing],
    [{ startDay: "2026-10-14", startTime: "25:00" }, EVENT_ERRORS.startTimeMissing],
    [{ startDay: "2026-10-14", startTime: "09:00", endTime: "9:5" }, EVENT_ERRORS.endTimeInvalid],
    [{ startDay: "2026-10-14", startTime: "09:00", endDay: "x" }, EVENT_ERRORS.endDayInvalid],
    [
      { startDay: "2026-10-14", startTime: "09:00", endDay: "2026-10-15" },
      EVENT_ERRORS.endDayWithoutTime,
    ],
    [{ startDay: "2026-10-14", startTime: "09:00", endTime: "08:59" }, EVENT_ERRORS.endBeforeStart],
    [
      { startDay: "2026-10-14", startTime: "09:00", endDay: "2026-10-13", endTime: "10:00" },
      EVENT_ERRORS.endBeforeStart,
    ],
    [
      { startDay: "2026-01-01", startTime: "09:00", endDay: "2027-01-03", endTime: "09:00" },
      EVENT_ERRORS.tooLong,
    ],
    [{ allDay: "true", startDay: "2026-10-14", endDay: "2026-10-13" }, EVENT_ERRORS.endBeforeStart],
    [{ allDay: "true", startDay: "2026-01-01", endDay: "2027-01-02" }, EVENT_ERRORS.tooLong],
  ])("refuses %j", (values, error) => {
    expect(validateEvent(fields(values))).toBe(error);
  });

  it("measures a timed event to the minute, as the API does", () => {
    const from = { startDay: "2026-10-14", startTime: "10:00" };

    // 366 days exactly is the longest; a minute more is too long.
    expect(validateEvent(fields({ ...from, endDay: "2027-10-15", endTime: "10:00" }))).toMatchObject(
      { when: { end_day: "2027-10-15", end_time: "10:00" } },
    );
    expect(validateEvent(fields({ ...from, endDay: "2027-10-15", endTime: "10:01" }))).toBe(
      EVENT_ERRORS.tooLong,
    );
    // The case the review found: 366 calendar days, but 366 days and an hour long.
    expect(validateEvent(fields({ ...from, endDay: "2027-10-15", endTime: "11:00" }))).toBe(
      EVENT_ERRORS.tooLong,
    );
    // A later end time on the 366th day is fine as long as the event is not longer.
    expect(
      validateEvent(fields({ ...from, startTime: "23:00", endDay: "2027-10-15", endTime: "22:59" })),
    ).toMatchObject({ when: { end_time: "22:59" } });
  });

  it("accepts the longest allowed values", () => {
    expect(
      validateEvent(
        fields({
          title: "🌙".repeat(200),
          notes: "x".repeat(8000),
          allDay: "true",
          startDay: "2026-01-01",
          endDay: "2027-01-01",
        }),
      ),
    ).toMatchObject({ when: { all_day: true, end_day: "2027-01-01" } });
    expect(
      validateEvent(
        fields({
          startDay: "2026-01-01",
          startTime: "09:00",
          endDay: "2027-01-02",
          endTime: "09:00",
        }),
      ),
    ).toMatchObject({ when: { end_day: "2027-01-02" } });
  });
});

describe("eventFields", () => {
  it("leaves the end empty for a one-day timed event's day and a point in time", () => {
    expect(eventFields(makeEvent({ notes: "Bring card" }))).toEqual({
      title: "Dentist",
      notes: "Bring card",
      allDay: "",
      startDay: "2026-10-14",
      startTime: "09:00",
      endDay: "",
      endTime: "09:45",
    });
    expect(eventFields(makeEvent({ endTime: "09:00" }))).toMatchObject({
      endDay: "",
      endTime: "",
    });
  });

  it("fills an all-day event over several days", () => {
    expect(eventFields(allDay("2026-10-20", "2026-10-23"))).toMatchObject({
      allDay: "true",
      startTime: "",
      endDay: "2026-10-23",
      endTime: "",
    });
  });

  it("round-trips through validateEvent", () => {
    const overnight = makeEvent({ startTime: "22:30", endDay: "2026-10-15", endTime: "06:10" });

    expect(validateEvent(eventFields(overnight))).toEqual({
      title: "Dentist",
      notes: null,
      when: {
        all_day: false,
        start_day: "2026-10-14",
        start_time: "22:30",
        end_day: "2026-10-15",
        end_time: "06:10",
      },
    });
  });
});

const valid = { title: "Dentist", startDay: "2026-10-14", startTime: "09:00" };

describe("performAddEvent", () => {
  it("creates the event", async () => {
    const create = succeed(makeEvent({}));

    expect(await performAddEvent(form(valid), "tok", { create })).toEqual({
      status: "success",
      message: "Added “Dentist”.",
    });
    expect(create).toHaveBeenCalledWith("tok", {
      title: "Dentist",
      notes: null,
      when: {
        all_day: false,
        start_day: "2026-10-14",
        start_time: "09:00",
        end_day: null,
        end_time: null,
      },
    });
  });

  it("is signed out without a token, and never calls the API", async () => {
    const create = succeed(makeEvent({}));

    expect(await performAddEvent(form(valid), undefined, { create })).toEqual({
      status: "signed_out",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps what was typed after a local error", async () => {
    const create = succeed(makeEvent({}));
    const state = await performAddEvent(form({ ...valid, startTime: "" }), "tok", { create });

    expect(state).toMatchObject({ status: "error", error: EVENT_ERRORS.startTimeMissing });
    expect(state.status === "error" && state.fields?.title).toBe("Dentist");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", EVENT_ERRORS.invalid],
    ["unavailable", EVENT_ERRORS.unavailable],
  ] as const)("shows the %s message and keeps the fields", async (error, message) => {
    const state = await performAddEvent(form(valid), "tok", { create: fail(error) });

    expect(state).toMatchObject({ status: "error", error: message, fields: { title: "Dentist" } });
  });

  it("shows the API's reason when it refuses the event", async () => {
    const reason = "An event can last at most 366 days.";
    const create = vi.fn().mockResolvedValue({ ok: false, error: "invalid", message: reason });

    expect(await performAddEvent(form(valid), "tok", { create })).toMatchObject({
      status: "error",
      error: reason,
      fields: { title: "Dentist" },
    });
  });

  it("is signed out when the API says the session is gone", async () => {
    expect(await performAddEvent(form(valid), "tok", { create: fail("unauthenticated") }))
      .toEqual({ status: "signed_out" });
  });
});

describe("performEditEvent", () => {
  it("sends the whole event, so blank notes clear them", async () => {
    const update = succeed(makeEvent({}));

    expect(
      await performEditEvent(form({ ...valid, id: "event-1", notes: "" }), "tok", { update }),
    ).toEqual({ status: "success" });
    expect(update).toHaveBeenCalledWith("tok", "event-1", {
      title: "Dentist",
      notes: null,
      when: expect.objectContaining({ all_day: false, start_time: "09:00" }),
    });
  });

  it("needs the event id", async () => {
    const update = succeed(makeEvent({}));

    expect(await performEditEvent(form(valid), "tok", { update })).toEqual({
      status: "error",
      error: EVENT_ERRORS.missingEvent,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("shows the API's reason when it refuses the change", async () => {
    const reason =
      "This time does not exist on that day because the clocks change. Choose another time.";
    const update = vi.fn().mockResolvedValue({ ok: false, error: "invalid", message: reason });

    expect(
      await performEditEvent(form({ ...valid, id: "event-1" }), "tok", { update }),
    ).toMatchObject({ status: "error", error: reason });
  });

  it("says when the event is gone", async () => {
    expect(
      await performEditEvent(form({ ...valid, id: "event-1" }), "tok", {
        update: fail("not_found"),
      }),
    ).toMatchObject({ status: "error", error: EVENT_ERRORS.not_found });
  });
});

describe("performDeleteEvent", () => {
  it("deletes only with the confirmation", async () => {
    const remove = succeed(undefined);

    expect(
      await performDeleteEvent(form({ id: "event-1", confirm: "delete" }), "tok", { remove }),
    ).toEqual({ status: "success" });
    expect(remove).toHaveBeenCalledWith("tok", "event-1");
  });

  it.each<Record<string, string>>([{ id: "event-1" }, { id: "event-1", confirm: "yes" }])(
    "refuses without the confirmation: %j",
    async (values) => {
      const remove = succeed(undefined);

      expect(await performDeleteEvent(form(values), "tok", { remove })).toEqual({
        status: "error",
        error: EVENT_ERRORS.notConfirmed,
      });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("needs the event id", async () => {
    const remove = succeed(undefined);

    expect(await performDeleteEvent(form({ confirm: "delete" }), "tok", { remove })).toEqual({
      status: "error",
      error: EVENT_ERRORS.missingEvent,
    });
  });

  it("counts an event already gone as deleted", async () => {
    expect(
      await performDeleteEvent(form({ id: "event-1", confirm: "delete" }), "tok", {
        remove: fail("not_found"),
      }),
    ).toEqual({ status: "success" });
  });

  it("shows other failures", async () => {
    expect(
      await performDeleteEvent(form({ id: "event-1", confirm: "delete" }), "tok", {
        remove: fail("unavailable"),
      }),
    ).toEqual({ status: "error", error: EVENT_ERRORS.unavailable });
    expect(
      await performDeleteEvent(form({ id: "event-1", confirm: "delete" }), undefined, {
        remove: fail("unavailable"),
      }),
    ).toEqual({ status: "signed_out" });
  });
});

describe("agenda window", () => {
  it("starts on ?from= when it is a real day, today otherwise", () => {
    expect(agendaStart("2026-10-19", "2026-10-12")).toBe("2026-10-19");
    expect(agendaStart(undefined, "2026-10-12")).toBe("2026-10-12");
    expect(agendaStart("2026-02-30", "2026-10-12")).toBe("2026-10-12");
    expect(agendaStart(["2026-10-19"], "2026-10-12")).toBe("2026-10-12");
  });

  it("keeps seven whole days near the first and last days there are", () => {
    expect(agendaStart("0001-01-01", "2026-10-12")).toBe("0001-01-01");
    expect(agendaStart("0000-12-31", "2026-10-12")).toBe("2026-10-12");
    expect(agendaStart("9999-12-25", "2026-10-12")).toBe("9999-12-25");
    expect(agendaStart("9999-12-28", "2026-10-12")).toBe("9999-12-25");
    expect(agendaEnd("9999-12-25")).toBe("9999-12-31");
    expect(buildAgenda("9999-12-25", "2026-10-12", []).map((day) => day.day).at(-1)).toBe(
      "9999-12-31",
    );
  });

  it.each([
    ["2026-10-12", "2026-10-05", "2026-10-19"],
    ["0001-01-08", "0001-01-01", "0001-01-15"],
    ["0001-01-03", "0001-01-01", "0001-01-10"],
    ["0001-01-01", null, "0001-01-08"],
    ["9999-12-18", "9999-12-11", "9999-12-25"],
    ["9999-12-20", "9999-12-13", "9999-12-25"],
    ["9999-12-25", "9999-12-18", null],
  ])("moves from %s back to %s and on to %s", (first, previous, next) => {
    expect(agendaNeighbours(first)).toEqual({ previous, next });
  });

  it("lasts seven days, across months and years", () => {
    expect(agendaEnd("2026-10-12")).toBe("2026-10-18");
    expect(agendaEnd("2026-12-29")).toBe("2027-01-04");
  });

  it.each([
    ["2026-10-12", "12 – 18 October 2026"],
    ["2026-10-28", "28 October – 3 November 2026"],
    ["2026-12-29", "29 December 2026 – 4 January 2027"],
  ])("labels the range from %s as %s", (first, label) => {
    expect(rangeLabel(first)).toBe(label);
  });
});

describe("timeLabel", () => {
  it("labels an all-day event", () => {
    expect(timeLabel(allDay("2026-10-14", "2026-10-16"), "2026-10-15")).toBe("All day");
  });

  it("labels a timed event and a point in time on one day", () => {
    expect(timeLabel(makeEvent({}), "2026-10-14")).toBe("09:00 – 09:45");
    expect(timeLabel(makeEvent({ endTime: "09:00" }), "2026-10-14")).toBe("09:00");
  });

  it("labels each day of an event over several days", () => {
    const trip = makeEvent({
      startTime: "22:30",
      endDay: "2026-10-16",
      endTime: "06:10",
      lastDay: "2026-10-16",
    });

    expect(timeLabel(trip, "2026-10-14")).toBe("From 22:30");
    expect(timeLabel(trip, "2026-10-15")).toBe("Continues");
    expect(timeLabel(trip, "2026-10-16")).toBe("Until 06:10");
  });

  it("ends an event ending at midnight at 24:00 on its last day", () => {
    const late = makeEvent({ startTime: "22:00", endDay: "2026-10-15", endTime: "00:00" });

    expect(timeLabel(late, "2026-10-14")).toBe("22:00 – 24:00");
    const overnight = { ...late, startDay: "2026-10-13", firstDay: "2026-10-13" };
    expect(timeLabel(overnight, "2026-10-14")).toBe("Until 24:00");
  });
});

describe("buildAgenda", () => {
  it("lists every day, marks today, and puts each event on the days it is on", () => {
    const trip = allDay("2026-10-11", "2026-10-13", { id: "trip", title: "Trip" });
    const dentist = makeEvent({ id: "dentist" });
    const agenda = buildAgenda("2026-10-12", "2026-10-13", [trip, dentist]);

    expect(agenda.map((day) => day.day)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(agenda[0].label).toBe("Monday 12 October");
    expect(agenda.map((day) => day.isToday)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(agenda.map((day) => day.events.map(({ event }) => event.id))).toEqual([
      ["trip"],
      ["trip"],
      ["dentist"],
      [],
      [],
      [],
      [],
    ]);
    expect(agenda[2].events[0].time).toBe("09:00 – 09:45");
  });

  it("keeps the API's order within a day", () => {
    const events = [
      allDay("2026-10-14", "2026-10-14", { id: "a" }),
      makeEvent({ id: "b", startTime: "08:00" }),
      makeEvent({ id: "c" }),
    ];

    expect(
      buildAgenda("2026-10-14", "2026-10-14", events)[0].events.map(({ event }) => event.id),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("todayPlans", () => {
  const today = "2026-10-14";
  const week = [
    allDay(today, "2026-10-15", { id: "all-day" }),
    ...["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"].map((time, index) =>
      makeEvent({ id: `t${index}`, startTime: time, endTime: time }),
    ),
    makeEvent({ id: "later", startDay: "2026-10-16", firstDay: "2026-10-16", lastDay: "2026-10-16" }),
  ];

  it("shows the first five of today's events in order, then counts the rest", () => {
    const plans = todayPlans(week, today);

    expect(plans.shown.map(({ event }) => event.id)).toEqual(["all-day", "t0", "t1", "t2", "t3"]);
    expect(plans.shown.map(({ time }) => time)).toEqual([
      "All day",
      "08:00",
      "09:00",
      "10:00",
      "11:00",
    ]);
    expect(plans.remaining).toBe(2);
    expect(plans.week).toBe(8);
  });

  it("has nothing more when today fits", () => {
    expect(todayPlans(week.slice(0, 3), today)).toMatchObject({ remaining: 0, week: 3 });
    expect(todayPlans([], today)).toEqual({ shown: [], remaining: 0, week: 0 });
  });

  it("includes an event that started before today and is still on", () => {
    const overnight = makeEvent({
      startDay: "2026-10-13",
      firstDay: "2026-10-13",
      startTime: "22:00",
      endTime: "02:00",
    });

    expect(todayPlans([overnight], today).shown).toEqual([
      { event: overnight, time: "Until 02:00" },
    ]);
  });

  it("labels the counts", () => {
    expect(weekPlansLabel(1)).toBe("1 plan in the next 7 days");
    expect(weekPlansLabel(3)).toBe("3 plans in the next 7 days");
    expect(moreTodayLabel(2)).toBe("and 2 more today");
  });
});
