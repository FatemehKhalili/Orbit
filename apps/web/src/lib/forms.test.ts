import { describe, expect, it } from "vitest";

import { failedState, formText, IDLE, SIGNED_OUT, textLength, type ApiErrorMessages } from "./forms";

const MESSAGES: ApiErrorMessages = {
  not_found: "gone",
  conflict: "not now",
  invalid: "bad input",
  unavailable: "down",
};

describe("formText", () => {
  it("trims text fields and reads missing or file fields as empty", () => {
    const data = new FormData();
    data.set("name", "  Read  ");
    data.set("file", new Blob(["x"]));

    expect(formText(data, "name")).toBe("Read");
    expect(formText(data, "missing")).toBe("");
    expect(formText(data, "file")).toBe("");
  });
});

describe("textLength", () => {
  it.each([
    ["", 0],
    ["Read", 4],
    ["Café", 4],
    ["😀", 1],
    ["🍎🍎🍎", 3],
  ])("counts %j as %i characters, like the API", (value, length) => {
    expect(textLength(value)).toBe(length);
  });
});

describe("failedState", () => {
  it("signs out when the session is gone", () => {
    expect(failedState("unauthenticated", MESSAGES)).toBe(SIGNED_OUT);
  });

  it.each(["not_found", "conflict", "invalid", "unavailable"] as const)(
    "shows the module's message for %s and keeps the fields",
    (error) => {
      expect(failedState(error, MESSAGES, { name: "Read" })).toEqual({
        status: "error",
        error: MESSAGES[error],
        fields: { name: "Read" },
      });
    },
  );

  it("starts idle", () => {
    expect(IDLE).toEqual({ status: "idle" });
  });
});
