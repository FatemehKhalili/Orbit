"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE } from "@/lib/shopping";
import type { ShoppingItem } from "@/lib/shopping-api";

import { editItem } from "../../actions";
import { FormMessage } from "../../form-message";
import { ItemFields } from "../../item-fields";

export function EditItemForm({ item }: { item: ShoppingItem }) {
  const [state, action, pending] = useActionState(editItem, IDLE);
  const values =
    state.status === "error" && state.fields
      ? state.fields
      : { name: item.name, quantity: item.quantity ?? "", notes: item.notes ?? "" };

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="edit-item-form">
      <input type="hidden" name="id" value={item.id} />
      <ItemFields idPrefix="edit-item" values={values} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Link href="/shopping" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
