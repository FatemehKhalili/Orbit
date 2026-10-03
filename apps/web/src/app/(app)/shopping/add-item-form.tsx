"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/shopping";

import { addItem } from "./actions";
import { FormMessage } from "./form-message";
import { ItemFields } from "./item-fields";

export function AddItemForm() {
  const [state, action, pending] = useActionState(addItem, IDLE);
  // After an error the fields keep what was typed; after success they start empty.
  const values = state.status === "error" ? state.fields : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="add-item-form">
      <ItemFields idPrefix="new-item" values={values} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add item"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
