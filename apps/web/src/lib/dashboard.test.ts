import { describe, expect, it, vi } from "vitest";

import {
  boughtFields,
  moreToBuyLabel,
  TO_BUY_LIMIT,
  todayCheckInFields,
  todayHabits,
  toBuyPreview,
} from "./dashboard";
import { countDoneToday, HABIT_ERRORS, performCheckIn } from "./habits";
import type { Habit } from "./habits-api";
import { countToBuy, performToggleItem, SHOPPING_ERRORS } from "./shopping";
import type { ShoppingItem } from "./shopping-api";

const today = "2026-10-12";

function habit(id: string, checkIns: string[] = [], archived = false): Habit {
  return {
    id,
    name: `Habit ${id}`,
    notes: null,
    archived,
    archivedAt: archived ? "2026-10-11T10:00:00Z" : null,
    checkIns,
    createdAt: "2026-10-03T10:00:00Z",
    updatedAt: "2026-10-03T10:00:00Z",
  };
}

function item(id: string, checked = false): ShoppingItem {
  return {
    id,
    name: `Item ${id}`,
    quantity: null,
    notes: null,
    checked,
    createdAt: "2026-10-03T10:00:00Z",
    updatedAt: "2026-10-03T10:00:00Z",
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("todayHabits", () => {
  it("lists every active habit in order with whether it was done today", () => {
    const habits = [habit("a", ["2026-10-11", today]), habit("b", ["2026-10-11"]), habit("c")];

    const view = todayHabits(habits, today);

    expect(view.rows.map((row) => [row.habit.id, row.done])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
    expect(view).toMatchObject({ done: 1, total: 3 });
  });

  it("matches the summary card's count", () => {
    const habits = [habit("a", [today]), habit("b", [today]), habit("c", ["2026-10-06"])];

    expect(todayHabits(habits, today).done).toBe(countDoneToday(habits, today));
  });

  it("leaves archived habits out", () => {
    const view = todayHabits([habit("a", [today], true), habit("b")], today);

    expect(view.rows.map((row) => row.habit.id)).toEqual(["b"]);
    expect(view).toMatchObject({ done: 0, total: 1 });
  });

  it("is empty without habits", () => {
    expect(todayHabits([], today)).toEqual({ rows: [], done: 0, total: 0 });
  });
});

describe("toBuyPreview", () => {
  it("shows the first unchecked items in the list's order and counts the rest", () => {
    const items = ["1", "2", "3", "4", "5", "6", "7"].map((id) => item(id));
    items.push(item("8", true));

    const preview = toBuyPreview(items);

    expect(preview.shown.map((shown) => shown.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(preview).toMatchObject({ remaining: 2, toBuy: 7 });
    expect(TO_BUY_LIMIT).toBe(5);
  });

  it("never shows checked items, wherever they are", () => {
    const items = [item("1", true), item("2"), item("3", true), item("4")];

    const preview = toBuyPreview(items);

    expect(preview.shown.map((shown) => shown.id)).toEqual(["2", "4"]);
    expect(preview).toMatchObject({ remaining: 0, toBuy: 2 });
  });

  it("matches the summary card's count", () => {
    const items = [item("1"), item("2", true), item("3")];

    expect(toBuyPreview(items).toBuy).toBe(countToBuy(items));
  });

  it("handles an empty list, an all-checked list and a zero limit", () => {
    expect(toBuyPreview([])).toEqual({ shown: [], remaining: 0, toBuy: 0 });
    expect(toBuyPreview([item("1", true)])).toEqual({ shown: [], remaining: 0, toBuy: 0 });
    expect(toBuyPreview([item("1")], 0)).toMatchObject({ shown: [], remaining: 1 });
  });

  it("labels the link to the rest", () => {
    expect(moreToBuyLabel(3)).toBe("and 3 more to buy");
  });
});

describe("todayCheckInFields", () => {
  it("asks to mark an undone habit done for today, and a done one not done", () => {
    expect(todayCheckInFields({ habit: habit("a"), done: false }, today)).toEqual({
      id: "a",
      day: today,
      done: "true",
    });
    expect(todayCheckInFields({ habit: habit("a", [today]), done: true }, today)).toEqual({
      id: "a",
      day: today,
      done: "false",
    });
  });

  it("drives the Habits check-in action, and a doubled submit sets the same state", async () => {
    const setCheckIn = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const fields = form(todayCheckInFields({ habit: habit("a"), done: false }, today));

    expect(await performCheckIn(fields, "tok", { setCheckIn })).toEqual({ status: "success" });
    expect(await performCheckIn(fields, "tok", { setCheckIn })).toEqual({ status: "success" });

    expect(setCheckIn).toHaveBeenCalledTimes(2);
    expect(setCheckIn).toHaveBeenNthCalledWith(1, "tok", "a", today, true);
    expect(setCheckIn).toHaveBeenNthCalledWith(2, "tok", "a", today, true);
  });

  it("explains a failure, and the same form succeeds when tried again", async () => {
    const setCheckIn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "unavailable" })
      .mockResolvedValueOnce({ ok: true, data: undefined });
    const fields = form(todayCheckInFields({ habit: habit("a"), done: false }, today));

    expect(await performCheckIn(fields, "tok", { setCheckIn })).toEqual({
      status: "error",
      error: HABIT_ERRORS.unavailable,
    });
    expect(await performCheckIn(fields, "tok", { setCheckIn })).toEqual({ status: "success" });
  });

  it("explains a habit archived in another tab", async () => {
    const setCheckIn = vi.fn().mockResolvedValue({ ok: false, error: "conflict" });
    const fields = form(todayCheckInFields({ habit: habit("a"), done: false }, today));

    expect(await performCheckIn(fields, "tok", { setCheckIn })).toEqual({
      status: "error",
      error: HABIT_ERRORS.conflict,
    });
  });
});

describe("boughtFields", () => {
  it("always marks the item bought, so a doubled submit cannot un-check it", async () => {
    const update = vi.fn().mockResolvedValue({ ok: true, data: item("1", true) });
    const fields = form(boughtFields(item("1")));

    expect(boughtFields(item("1"))).toEqual({ id: "1", checked: "true" });
    expect(await performToggleItem(fields, "tok", { update })).toEqual({ status: "success" });
    expect(await performToggleItem(fields, "tok", { update })).toEqual({ status: "success" });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, "tok", "1", { checked: true });
    expect(update).toHaveBeenNthCalledWith(2, "tok", "1", { checked: true });
  });

  it("explains a failure, and the same form succeeds when tried again", async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "unavailable" })
      .mockResolvedValueOnce({ ok: true, data: item("1", true) });
    const fields = form(boughtFields(item("1")));

    expect(await performToggleItem(fields, "tok", { update })).toEqual({
      status: "error",
      error: SHOPPING_ERRORS.unavailable,
    });
    expect(await performToggleItem(fields, "tok", { update })).toEqual({ status: "success" });
  });

  it("explains an item deleted in another tab", async () => {
    const update = vi.fn().mockResolvedValue({ ok: false, error: "not_found" });

    expect(await performToggleItem(form(boughtFields(item("1"))), "tok", { update })).toEqual({
      status: "error",
      error: SHOPPING_ERRORS.not_found,
    });
  });
});
