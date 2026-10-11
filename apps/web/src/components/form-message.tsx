import type { FormState } from "@/lib/forms";

/** The outcome of a form: an error, or a short confirmation. */
export function FormMessage({ state }: { state: FormState<unknown> }) {
  if (state.status === "error") {
    return (
      <p role="alert" className="text-destructive text-sm">
        {state.error}
      </p>
    );
  }
  if (state.status === "success" && state.message) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {state.message}
      </p>
    );
  }
  return null;
}
