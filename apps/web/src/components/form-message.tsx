import type { ReactNode } from "react";

import { AlertIcon, CheckIcon } from "@/components/icons";
import type { FormState } from "@/lib/forms";

/** The outcome of a form: an error, or a short confirmation, as a soft pill. */
export function FormMessage({ state }: { state: FormState<unknown> }) {
  if (state.status === "error") return <ErrorMessage>{state.error}</ErrorMessage>;
  if (state.status === "success" && state.message) {
    return (
      <p
        role="status"
        className="bg-mint-soft text-mint-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
      >
        <CheckIcon className="size-3.5" />
        {state.message}
      </p>
    );
  }
  return null;
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="bg-blush-soft text-blush-ink inline-flex items-start gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-medium"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
