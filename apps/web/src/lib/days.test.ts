import { afterEach, describe, expect, it, vi } from "vitest";

import { addDays, daysBetween, formatDay, formatLongDate } from "./days";

describe("calendar dates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysBetween("2026-10-14", "2026-10-20")).toBe(6);
    expect(daysBetween("2026-10-20", "2026-10-14")).toBe(-6);
    // Across the end of summer time: still whole days, since dates carry no zone.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"])(
    "labels the same day when the server runs in %s",
    (zone) => {
      vi.stubEnv("TZ", zone);
      expect(formatLongDate("2026-10-11")).toBe("Sunday, 11 October 2026");
      expect(formatDay("2026-10-11", { weekday: "short" })).toBe("Sun");
    },
  );
});
