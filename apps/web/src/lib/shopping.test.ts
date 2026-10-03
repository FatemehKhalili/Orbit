import { describe, expect, it, vi } from "vitest";

import type { ApiError } from "./api-client";
import {
  performAddItem,
  performDeleteItem,
  performEditItem,
  performToggleItem,
  readItemFields,
  SHOPPING_ERRORS,
  summarize,
  validateItem,
} from "./shopping";
import type { ShoppingItem } from "./shopping-api";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const saved: ShoppingItem = {
  id: "item-1",
  name: "Milk",
  quantity: null,
  notes: null,
  checked: false,
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:00:00Z",
};

const succeed = <T>(data: T) => vi.fn().mockResolvedValue({ ok: true, data });
const fail = (error: ApiError) => vi.fn().mockResolvedValue({ ok: false, error });

describe("readItemFields and validateItem", () => {
  it("trims the fields and turns blank optional ones into null", () => {
    const fields = readItemFields(form({ name: "  Milk ", quantity: " ", notes: " Oat " }));

    expect(fields).toEqual({ name: "Milk", quantity: "", notes: "Oat" });
    expect(validateItem(fields)).toEqual({ name: "Milk", quantity: null, notes: "Oat" });
  });

  it("treats missing fields as empty", () => {
    expect(readItemFields(form({}))).toEqual({ name: "", quantity: "", notes: "" });
  });

  it.each([
    [{ name: "", quantity: "", notes: "" }, SHOPPING_ERRORS.nameMissing],
    [{ name: "x".repeat(201), quantity: "", notes: "" }, SHOPPING_ERRORS.nameTooLong],
    [{ name: "Milk", quantity: "x".repeat(51), notes: "" }, SHOPPING_ERRORS.quantityTooLong],
    [{ name: "Milk", quantity: "", notes: "x".repeat(1001) }, SHOPPING_ERRORS.notesTooLong],
  ])("refuses %j", (fields, error) => {
    expect(validateItem(fields)).toBe(error);
  });

  it("accepts the longest allowed values", () => {
    const fields = { name: "n".repeat(200), quantity: "q".repeat(50), notes: "x".repeat(1000) };
    expect(typeof validateItem(fields)).toBe("object");
  });
});

describe("performAddItem", () => {
  it("creates the item and confirms it", async () => {
    const create = succeed(saved);

    const state = await performAddItem(form({ name: " Milk ", quantity: "2" }), "tok", { create });

    expect(create).toHaveBeenCalledWith("tok", { name: "Milk", quantity: "2", notes: null });
    expect(state).toEqual({ status: "success", message: "Added “Milk”." });
  });

  it("keeps what was typed and does not call the API when the name is missing", async () => {
    const create = succeed(saved);

    const state = await performAddItem(form({ name: " ", quantity: "2" }), "tok", { create });

    expect(state).toEqual({
      status: "error",
      error: SHOPPING_ERRORS.nameMissing,
      fields: { name: "", quantity: "2", notes: "" },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each<[ApiError, string]>([
    ["invalid", SHOPPING_ERRORS.invalid],
    ["unavailable", SHOPPING_ERRORS.unavailable],
  ])("explains a %s failure and keeps the fields", async (error, message) => {
    const state = await performAddItem(form({ name: "Milk" }), "tok", { create: fail(error) });

    expect(state).toMatchObject({ status: "error", error: message, fields: { name: "Milk" } });
  });

  it("signs out when there is no session or the API rejects it", async () => {
    const create = succeed(saved);
    expect(await performAddItem(form({ name: "Milk" }), undefined, { create })).toEqual({
      status: "signed_out",
    });
    expect(create).not.toHaveBeenCalled();

    expect(
      await performAddItem(form({ name: "Milk" }), "tok", { create: fail("unauthenticated") }),
    ).toEqual({ status: "signed_out" });
  });
});

describe("performEditItem", () => {
  it("sends every field, so emptied optional fields are cleared", async () => {
    const update = succeed(saved);

    const state = await performEditItem(
      form({ id: "item-1", name: "Oat milk", quantity: "", notes: "" }),
      "tok",
      { update },
    );

    expect(update).toHaveBeenCalledWith("tok", "item-1", {
      name: "Oat milk",
      quantity: null,
      notes: null,
    });
    expect(state).toEqual({ status: "success" });
  });

  it("refuses a form without an item ID", async () => {
    const update = succeed(saved);

    const state = await performEditItem(form({ name: "Milk" }), "tok", { update });

    expect(state).toEqual({ status: "error", error: SHOPPING_ERRORS.missingItem });
    expect(update).not.toHaveBeenCalled();
  });

  // Another user's item looks exactly like a missing one (ADR 0007).
  it("says when the item no longer exists", async () => {
    const state = await performEditItem(form({ id: "someone-elses", name: "Milk" }), "tok", {
      update: fail("not_found"),
    });

    expect(state).toMatchObject({ status: "error", error: SHOPPING_ERRORS.not_found });
  });

  it("signs out without a session", async () => {
    const update = succeed(saved);
    const state = await performEditItem(form({ id: "item-1", name: "Milk" }), undefined, {
      update,
    });

    expect(state).toEqual({ status: "signed_out" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("performToggleItem", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])("sets checked to the value the form carries (%s)", async (value, checked) => {
    const update = succeed(saved);

    const data = form({ id: "item-1", checked: value });

    const state = await performToggleItem(data, "tok", { update });

    expect(update).toHaveBeenCalledWith("tok", "item-1", { checked });
    expect(state).toEqual({ status: "success" });
  });

  it("reports failures", async () => {
    expect(
      await performToggleItem(form({ id: "item-1", checked: "true" }), "tok", {
        update: fail("unavailable"),
      }),
    ).toEqual({ status: "error", error: SHOPPING_ERRORS.unavailable, fields: undefined });
    expect(
      await performToggleItem(form({ id: "item-1", checked: "true" }), "tok", {
        update: fail("unauthenticated"),
      }),
    ).toEqual({ status: "signed_out" });
  });
});

describe("performDeleteItem", () => {
  it("deletes the item", async () => {
    const remove = succeed(undefined);

    expect(await performDeleteItem(form({ id: "item-1" }), "tok", { remove })).toEqual({
      status: "success",
    });
    expect(remove).toHaveBeenCalledWith("tok", "item-1");
  });

  it("treats an item that is already gone as deleted", async () => {
    expect(
      await performDeleteItem(form({ id: "item-1" }), "tok", { remove: fail("not_found") }),
    ).toEqual({ status: "success" });
  });

  it("reports other failures and refuses a form without an ID", async () => {
    expect(
      await performDeleteItem(form({ id: "item-1" }), "tok", { remove: fail("unavailable") }),
    ).toMatchObject({ status: "error", error: SHOPPING_ERRORS.unavailable });
    expect(await performDeleteItem(form({}), "tok", { remove: succeed(undefined) })).toEqual({
      status: "error",
      error: SHOPPING_ERRORS.missingItem,
    });
  });
});

describe("summarize", () => {
  it.each([
    [[], "Nothing on the list"],
    [[{ checked: false }, { checked: false }], "2 to buy"],
    [[{ checked: false }, { checked: true }, { checked: true }], "1 to buy · 2 checked"],
  ])("%j → %s", (items, text) => {
    expect(summarize(items)).toBe(text);
  });
});
