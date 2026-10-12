import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});
const clearSession = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ clearSession }));

const { settleAction } = await import("./form-actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settleAction", () => {
  it.each([
    ["success", { status: "success" }],
    ["error", { status: "error", error: "down" }],
  ] as const)("refreshes the module and the Dashboard after %s", async (_name, state) => {
    expect(await settleAction(state, "/habits", "layout")).toBe(state);

    expect(revalidatePath).toHaveBeenCalledWith("/habits", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refreshes a module page without a type", async () => {
    await settleAction({ status: "success" }, "/shopping");

    expect(revalidatePath.mock.calls).toEqual([["/shopping", undefined], ["/"]]);
  });

  it("refreshes the Dashboard once when it is the path", async () => {
    await settleAction({ status: "success" }, "/");

    expect(revalidatePath.mock.calls).toEqual([["/", undefined]]);
  });

  it("clears the session and goes to the login page when signed out", async () => {
    await expect(settleAction({ status: "signed_out" }, "/habits")).rejects.toThrow(
      "redirect:/login",
    );

    expect(clearSession).toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
